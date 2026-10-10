// Claude jobs on your subscription runner (same queue + security as voice):
// enqueue → GitHub Actions runner claims it → Claude answers → we apply the
// answer here (create the devlog idea, store hooks, draft replies, themes).
//
// Prompts are built at CLAIM time from fresh data, so a job queued an hour
// ago still sees the latest idea text / comments.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { digests, gameSettings, playtestFeedback, voiceCommands, youtubeChannels, youtubeComments, youtubeIdeas, youtubeVideos, type VoiceCommand } from "@/lib/db/schema";
import {
  commentRepliesPrompt, devlogPrompt, hooksPrompt, parseDevlog, parseHooks, parseReplies, parseThemes, playtestPrompt,
  type DevlogCommit, type JobKind,
} from "@/lib/claude-jobs";
import { checkRateLimit } from "@/lib/ratelimit";
import { VOICE_RATE } from "@/lib/voice";
import { dispatchRunner } from "@/lib/services/voice";
import { digestPrompt } from "@/lib/digest";
import { applyDigestResult } from "@/lib/services/digest";

export async function enqueueJobFor(userId: number, kind: Exclude<JobKind, "voice">, label: string, payload: Record<string, unknown>) {
  if (!checkRateLimit(`voice:${userId}`, VOICE_RATE.max, VOICE_RATE.windowMs).allowed) {
    throw new Error("That's a lot of Claude jobs for one hour — try again a bit later.");
  }
  const now = new Date();
  const [row] = await db
    .insert(voiceCommands)
    .values({
      userId,
      kind,
      payload,
      transcript: label.slice(0, 500),
      localDate: now.toISOString().slice(0, 10),
      localTime: now.toISOString().slice(11, 16),
      timezone: "UTC",
    })
    .returning({ id: voiceCommands.id });
  const dispatched = await dispatchRunner(userId);
  return { id: row.id, dispatched };
}

async function bestVideosFor(userId: number) {
  const rows = await db
    .select({ title: youtubeVideos.title, views: youtubeVideos.views })
    .from(youtubeVideos)
    .where(eq(youtubeVideos.userId, userId))
    .orderBy(desc(youtubeVideos.views))
    .limit(5);
  return rows.map((r) => `${r.title} (${r.views} views)`);
}

/** The system + user prompt for a non-voice job, from current data. */
export async function buildJobPrompt(row: Pick<VoiceCommand, "userId" | "kind" | "payload">): Promise<{ system: string; prompt: string }> {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  switch (row.kind) {
    case "devlog":
      return devlogPrompt({ game: String(p.game ?? "my game"), commits: (p.commits as DevlogCommit[]) ?? [], bestVideos: await bestVideosFor(row.userId) });
    case "hooks": {
      const [idea] = await db.select().from(youtubeIdeas).where(and(eq(youtubeIdeas.id, Number(p.ideaId)), eq(youtubeIdeas.userId, row.userId))).limit(1);
      if (!idea) throw new Error("Idea not found.");
      return hooksPrompt({ title: idea.title, notes: idea.notes, script: idea.script, format: idea.format, bestVideos: await bestVideosFor(row.userId) });
    }
    case "comment_replies": {
      const ids = ((p.commentIds as number[]) ?? []).slice(0, 25);
      const comments = ids.length
        ? await db.select().from(youtubeComments).where(and(eq(youtubeComments.userId, row.userId), inArray(youtubeComments.id, ids)))
        : [];
      const videoIds = [...new Set(comments.map((c) => c.videoId))];
      const videos = videoIds.length
        ? await db.select({ videoId: youtubeVideos.videoId, title: youtubeVideos.title }).from(youtubeVideos).where(and(eq(youtubeVideos.userId, row.userId), inArray(youtubeVideos.videoId, videoIds)))
        : [];
      const [ch] = await db.select({ title: youtubeChannels.title }).from(youtubeChannels).where(eq(youtubeChannels.userId, row.userId)).limit(1);
      return commentRepliesPrompt({
        channel: ch?.title ?? "my channel",
        comments: comments.map((c) => ({ id: String(c.id), author: c.author, text: c.text, video: videos.find((v) => v.videoId === c.videoId)?.title ?? "a video" })),
      });
    }
    case "playtest": {
      const feedback = await db.select().from(playtestFeedback).where(eq(playtestFeedback.userId, row.userId)).orderBy(desc(playtestFeedback.id)).limit(200);
      return playtestPrompt({ game: String(p.game ?? "my game"), feedback });
    }
    case "digest": {
      const [d] = await db.select().from(digests).where(and(eq(digests.id, Number(p.digestId)), eq(digests.userId, row.userId))).limit(1);
      if (!d) throw new Error("Digest not found.");
      return digestPrompt(d.items, String(d.day));
    }
    default:
      throw new Error(`Unknown job kind "${row.kind}".`);
  }
}

/** Store what Claude produced. Returns a one-line summary for the notification. */
export async function applyJobResult(row: VoiceCommand, text: string): Promise<string> {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  switch (row.kind) {
    case "devlog": {
      const d = parseDevlog(text);
      if (!d) throw new Error("Claude's devlog reply couldn't be read.");
      const notes = [d.shots.length ? `Shots to record:\n${d.shots.map((s) => `- ${s}`).join("\n")}` : "", `From ${(p.commits as unknown[])?.length ?? 0} commits.`].filter(Boolean).join("\n\n");
      const [ch] = await db.select({ id: youtubeChannels.id }).from(youtubeChannels).where(eq(youtubeChannels.userId, row.userId)).limit(1);
      await db.insert(youtubeIdeas).values({
        userId: row.userId, channelRowId: ch?.id ?? null, title: d.title, format: "short", stage: "script",
        hook: d.hook || null, script: d.script, notes, source: "devlog",
      });
      await db.update(gameSettings).set({ lastDevlogSha: String(p.headSha ?? ""), lastDevlogAt: new Date(), updatedAt: new Date() }).where(eq(gameSettings.userId, row.userId));
      return `Devlog script ready: "${d.title}"`;
    }
    case "hooks": {
      const hooks = parseHooks(text);
      if (hooks.length === 0) throw new Error("Claude's hooks couldn't be read.");
      await db.update(youtubeIdeas).set({ hooks, updatedAt: new Date() }).where(and(eq(youtubeIdeas.id, Number(p.ideaId)), eq(youtubeIdeas.userId, row.userId)));
      return `${hooks.length} hooks ready — pick one`;
    }
    case "comment_replies": {
      const replies = parseReplies(text);
      for (const r of replies) {
        await db
          .update(youtubeComments)
          .set({ reply: r.reply, status: "drafted" })
          .where(and(eq(youtubeComments.id, Number(r.id)), eq(youtubeComments.userId, row.userId), inArray(youtubeComments.status, ["new", "drafted"])));
      }
      return `${replies.length} repl${replies.length === 1 ? "y" : "ies"} drafted`;
    }
    case "playtest": {
      const themes = parseThemes(text);
      if (themes.length === 0) throw new Error("Claude's themes couldn't be read.");
      await db.insert(gameSettings).values({ userId: row.userId }).onConflictDoNothing();
      await db.update(gameSettings).set({ playtestThemes: themes, playtestThemesAt: new Date(), updatedAt: new Date() }).where(eq(gameSettings.userId, row.userId));
      return `${themes.length} themes found in your playtest feedback`;
    }
    case "digest":
      return applyDigestResult(row.userId, Number(p.digestId), text);
    default:
      return "Done";
  }
}
