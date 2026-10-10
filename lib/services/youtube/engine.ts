// YouTube studio: connect channels, sync public data, and ask Claude for a
// channel review, per-video fixes and Shorts scripts. Audit rules are pure
// (lib/youtube.ts) and run on read, so they never go stale.

import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSettings, tasks, youtubeChannels, youtubeComments, youtubeIdeas, youtubeVideos, type YoutubeIdea, type YoutubeVideo } from "@/lib/db/schema";
import {
  auditVideo, channelContext, channelFindings, ideaTaskPlan, isIdeaStage, isShortVideo, parseChannelInput, parseDuration,
  type AuditVideo,
} from "@/lib/youtube";
import { askClaude } from "@/lib/services/claude";
import { getSecret, getYoutubeKey, setSecret } from "@/lib/services/secrets";
import { fetchChannel, fetchComments, fetchUploads } from "./api";
import { enqueueJobFor } from "@/lib/services/claude-jobs";
import { localNow } from "@/lib/outreach";

async function requireYoutubeKey(userId: number) {
  const key = await getYoutubeKey(userId);
  if (!key) throw new Error("Add a YouTube Data API key in YouTube → Setup first.");
  return key;
}

async function requireAnthropicKey(userId: number) {
  const key = await getSecret(userId, "anthropic");
  if (!key) throw new Error("Add an Anthropic API key in YouTube → Setup to use Claude.");
  return key;
}

async function ownedChannel(userId: number, channelRowId: number) {
  const [row] = await db
    .select()
    .from(youtubeChannels)
    .where(and(eq(youtubeChannels.id, channelRowId), eq(youtubeChannels.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Channel not found.");
  return row;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export async function keyStatusFor(userId: number) {
  const [youtube, google, anthropic] = await Promise.all([
    getSecret(userId, "youtube"), getSecret(userId, "google"), getSecret(userId, "anthropic"),
  ]);
  return { youtube: !!youtube, googleFallback: !youtube && !!google, anthropic: !!anthropic };
}

export async function saveKeysFor(userId: number, keys: { youtube?: string; anthropic?: string }) {
  if (keys.youtube !== undefined) await setSecret(userId, "youtube", keys.youtube);
  if (keys.anthropic !== undefined) await setSecret(userId, "anthropic", keys.anthropic);
}

/** In an upsert, the value from the row we tried to insert. */
const sqlExcluded = (col: string) => sql.raw(`excluded."${col}"`);

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function connectChannelFor(userId: number, input: string) {
  const ref = parseChannelInput(input);
  if (!ref) throw new Error("Paste a channel link, @handle or channel ID.");
  const key = await requireYoutubeKey(userId);
  const ch = await fetchChannel(key, ref);
  if (!ch) throw new Error("No channel found for that link.");
  const [row] = await db
    .insert(youtubeChannels)
    .values({ userId, channelId: ch.channelId, title: ch.title })
    .onConflictDoUpdate({ target: [youtubeChannels.userId, youtubeChannels.channelId], set: { title: ch.title } })
    .returning();
  await syncChannelFor(userId, row.id);
  return row;
}

export async function syncChannelFor(userId: number, channelRowId: number) {
  const row = await ownedChannel(userId, channelRowId);
  const key = await requireYoutubeKey(userId);
  const ch = await fetchChannel(key, { id: row.channelId });
  if (!ch) throw new Error("That channel no longer exists.");
  const uploads = await fetchUploads(key, ch.uploadsPlaylistId);

  if (uploads.length > 0) {
    await db
      .insert(youtubeVideos)
      .values(
        uploads.map((v) => {
          const durationSec = parseDuration(v.duration);
          return {
            userId,
            channelRowId,
            videoId: v.videoId,
            title: v.title.slice(0, 255),
            description: v.description,
            tags: v.tags,
            publishedAt: new Date(v.publishedAt),
            durationSec,
            isShort: isShortVideo(durationSec, v.title, v.description),
            views: v.views,
            likes: v.likes,
            comments: v.comments,
            thumbnailUrl: v.thumbnailUrl,
            hasCaptions: v.hasCaptions,
          };
        })
      )
      // Public fields refresh; your own notes (Studio numbers, script,
      // Claude suggestions) are left alone.
      .onConflictDoUpdate({
        target: [youtubeVideos.userId, youtubeVideos.videoId],
        set: {
          title: sqlExcluded("title"), description: sqlExcluded("description"), tags: sqlExcluded("tags"),
          durationSec: sqlExcluded("duration_sec"), isShort: sqlExcluded("is_short"), views: sqlExcluded("views"),
          likes: sqlExcluded("likes"), comments: sqlExcluded("comments"), thumbnailUrl: sqlExcluded("thumbnail_url"),
          hasCaptions: sqlExcluded("has_captions"), updatedAt: new Date(),
        },
      });
  }

  await db
    .update(youtubeChannels)
    .set({
      title: ch.title, handle: ch.handle, description: ch.description, thumbnailUrl: ch.thumbnailUrl,
      subscribers: ch.subscribers, totalViews: ch.totalViews, videoCount: ch.videoCount, lastSyncedAt: new Date(),
    })
    .where(eq(youtubeChannels.id, channelRowId));
  const comments = await syncCommentsFor(userId, channelRowId, key, ch.channelId, uploads.slice(0, 10).map((v) => v.videoId));
  return { videos: uploads.length, comments };
}

/** Newest comments on your 10 latest videos into the inbox. Your own comments and ones you already answered are skipped. */
async function syncCommentsFor(userId: number, channelRowId: number, key: string, ownerChannelId: string, videoIds: string[]) {
  let added = 0;
  for (const videoId of videoIds) {
    const list = await fetchComments(key, videoId, ownerChannelId);
    const fresh = list.filter((c) => c.authorChannelId !== ownerChannelId);
    if (fresh.length === 0) continue;
    const rows = await db
      .insert(youtubeComments)
      .values(fresh.map((c) => ({
        userId, channelRowId, videoId: c.videoId, commentId: c.commentId, author: c.author.slice(0, 120), text: c.text.slice(0, 5000),
        publishedAt: new Date(c.publishedAt), likeCount: c.likeCount, status: c.ownerReplied ? "replied" : "new",
      })))
      .onConflictDoNothing({ target: [youtubeComments.userId, youtubeComments.commentId] })
      .returning({ id: youtubeComments.id });
    added += rows.length;
    // Answered on YouTube since the last sync: leave the inbox.
    const replied = fresh.filter((c) => c.ownerReplied).map((c) => c.commentId);
    if (replied.length) {
      await db.update(youtubeComments).set({ status: "replied" })
        .where(and(eq(youtubeComments.userId, userId), inArray(youtubeComments.commentId, replied), ne(youtubeComments.status, "ignored")));
    }
  }
  return added;
}

export async function updateCommentFor(userId: number, id: number, patch: { status?: string; reply?: string }) {
  const set: { status?: string; reply?: string | null } = {};
  if (patch.status !== undefined) {
    if (!["new", "drafted", "replied", "ignored"].includes(patch.status)) throw new Error("Unknown status.");
    set.status = patch.status;
  }
  if (patch.reply !== undefined) set.reply = String(patch.reply).slice(0, 1000) || null;
  await db.update(youtubeComments).set(set).where(and(eq(youtubeComments.id, id), eq(youtubeComments.userId, userId)));
}

/** Claude drafts replies for every comment still waiting (max 25 per run). */
export async function draftRepliesFor(userId: number) {
  const waiting = await db
    .select({ id: youtubeComments.id })
    .from(youtubeComments)
    .where(and(eq(youtubeComments.userId, userId), eq(youtubeComments.status, "new")))
    .orderBy(desc(youtubeComments.publishedAt))
    .limit(25);
  if (waiting.length === 0) throw new Error("No new comments to reply to. Sync first.");
  return enqueueJobFor(userId, "comment_replies", `Draft replies to ${waiting.length} comment${waiting.length === 1 ? "" : "s"}`, { commentIds: waiting.map((w) => w.id) });
}

/** Hook lab: 10 opening lines for an idea, from Claude. */
export async function hookLabFor(userId: number, ideaId: number) {
  const [idea] = await db.select({ id: youtubeIdeas.id, title: youtubeIdeas.title }).from(youtubeIdeas)
    .where(and(eq(youtubeIdeas.id, ideaId), eq(youtubeIdeas.userId, userId))).limit(1);
  if (!idea) throw new Error("Idea not found.");
  return enqueueJobFor(userId, "hooks", `Hooks for "${idea.title}"`, { ideaId });
}

// ─── Content calendar ─────────────────────────────────────────────────────────

async function todayFor(userId: number) {
  const [row] = await db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  return localNow(row?.tz ?? "Europe/Sarajevo").day;
}

/**
 * A publish date on an idea = Record / Edit / Publish tasks on your Tasks
 * page (area: youtube). Dates follow the idea; finished tasks are left alone;
 * no date (or a deleted idea) removes the open ones.
 */
async function syncIdeaTasks(userId: number, idea: YoutubeIdea | null, ideaId: number) {
  const linked = await db.select().from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.youtubeIdeaId, ideaId), isNull(tasks.deletedAt)));
  const now = new Date();
  if (!idea || !idea.dueDate) {
    const open = linked.filter((t) => t.status !== "done").map((t) => t.id);
    if (open.length) await db.update(tasks).set({ deletedAt: now, deletionReviewedAt: now }).where(inArray(tasks.id, open));
    return;
  }
  if (idea.stage === "published") return; // done: leave history as it is
  const plan = ideaTaskPlan(idea.dueDate, await todayFor(userId));
  for (const step of plan) {
    const title = `${step.phase}: ${idea.title}`.slice(0, 500);
    const existing = linked.find((t) => t.phase === step.phase);
    if (existing) {
      if (existing.status !== "done") await db.update(tasks).set({ title, dueDate: step.dueDate, updatedAt: now }).where(eq(tasks.id, existing.id));
    } else {
      await db.insert(tasks).values({ userId, title, dueDate: step.dueDate, phase: step.phase, area: "youtube", youtubeIdeaId: ideaId, priority: step.phase === "Publish" ? "medium" : "none" });
    }
  }
}

export async function removeChannelFor(userId: number, channelRowId: number) {
  await db.delete(youtubeChannels).where(and(eq(youtubeChannels.id, channelRowId), eq(youtubeChannels.userId, userId)));
}

export async function studioFor(userId: number) {
  const [channels, videos, ideas, keys, comments, ideaTasks] = await Promise.all([
    db.select().from(youtubeChannels).where(eq(youtubeChannels.userId, userId)).orderBy(asc(youtubeChannels.createdAt)),
    db.select().from(youtubeVideos).where(eq(youtubeVideos.userId, userId)).orderBy(desc(youtubeVideos.publishedAt)),
    db.select().from(youtubeIdeas).where(eq(youtubeIdeas.userId, userId)).orderBy(desc(youtubeIdeas.updatedAt)),
    keyStatusFor(userId),
    db.select().from(youtubeComments).where(and(eq(youtubeComments.userId, userId), inArray(youtubeComments.status, ["new", "drafted"])))
      .orderBy(desc(youtubeComments.publishedAt)).limit(100),
    db.select({ id: tasks.id, ideaId: tasks.youtubeIdeaId, phase: tasks.phase, dueDate: tasks.dueDate, status: tasks.status })
      .from(tasks).where(and(eq(tasks.userId, userId), isNotNull(tasks.youtubeIdeaId), isNull(tasks.deletedAt))),
  ]);
  return { channels, videos, ideas, keys, comments, ideaTasks };
}

// ─── Videos ───────────────────────────────────────────────────────────────────

export type VideoPatch = Partial<{ swipeViewedPct: number | null; avgViewedPct: number | null; script: string }>;

const pct = (v: unknown) => (v === null || v === "" || v === undefined || Number.isNaN(Number(v)) ? null : Math.min(100, Math.max(0, Math.round(Number(v)))));

export async function updateVideoFor(userId: number, id: number, patch: VideoPatch) {
  const set: Partial<YoutubeVideo> = { updatedAt: new Date() };
  if (patch.swipeViewedPct !== undefined) set.swipeViewedPct = pct(patch.swipeViewedPct);
  if (patch.avgViewedPct !== undefined) set.avgViewedPct = pct(patch.avgViewedPct);
  if (patch.script !== undefined) set.script = String(patch.script).slice(0, 10_000) || null;
  const [row] = await db
    .update(youtubeVideos)
    .set(set)
    .where(and(eq(youtubeVideos.id, id), eq(youtubeVideos.userId, userId)))
    .returning();
  if (!row) throw new Error("Video not found.");
  return row;
}

const toAudit = (v: YoutubeVideo): AuditVideo => ({ ...v, description: v.description ?? "", tags: v.tags ?? [] });

function videoFacts(v: YoutubeVideo, issues: string[]) {
  return {
    title: v.title,
    published: v.publishedAt.toISOString().slice(0, 10),
    format: v.isShort ? "Short" : "Long-form",
    seconds: v.durationSec,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    viewedVsSwipedPct: v.swipeViewedPct,
    avgViewedPct: v.avgViewedPct,
    tags: v.tags,
    descriptionStart: v.description.slice(0, 300),
    script: v.script?.slice(0, 2000) ?? null,
    flagged: issues,
  };
}

const CHANNEL_SYSTEM = `You are a YouTube growth strategist who specialises in Shorts for small creators.
You get a channel's public numbers, every video's metadata, rule-based flags, and sometimes the creator's own retention numbers and scripts.

Write a direct, specific review in English, plain text (no markdown symbols), using exactly these headings on their own lines:
VERDICT
WHY VIEWS ARE LOW
FIX FIRST
KEEP DOING
NEXT 5 SHORTS

Rules:
- VERDICT: 2 sentences.
- WHY VIEWS ARE LOW: up to 5 numbered reasons, most important first, each tied to evidence from the data (name videos and numbers).
- FIX FIRST: 3 numbered, concrete actions for the next upload.
- KEEP DOING: 2 lines.
- NEXT 5 SHORTS: numbered; each has a title and the exact first spoken line (the hook, under 12 words), aimed at the audience that already responded best.
- Never invent numbers. If something can't be known from public data (e.g. retention), say what to check in YouTube Studio.
- Thumbnails barely matter for Shorts in the feed; don't over-focus on them unless the data says so.`;

export async function channelReportFor(userId: number, channelRowId: number) {
  const apiKey = await requireAnthropicKey(userId);
  const ch = await ownedChannel(userId, channelRowId);
  const videos = await db.select().from(youtubeVideos).where(eq(youtubeVideos.channelRowId, channelRowId)).orderBy(asc(youtubeVideos.publishedAt));
  if (videos.length === 0) throw new Error("Sync the channel first.");

  const audit = videos.map(toAudit);
  const ctx = channelContext(audit);
  const prompt = JSON.stringify({
    channel: { title: ch.title, subscribers: ch.subscribers, totalViews: ch.totalViews, about: ch.description?.slice(0, 500) },
    channelFlags: channelFindings(audit).map((i) => i.title),
    videosOldestFirst: videos.map((v, i) => videoFacts(v, auditVideo(audit[i], ctx).map((x) => x.title))),
  }, null, 1);

  const report = await askClaude({ apiKey, system: CHANNEL_SYSTEM, prompt, effort: "medium", maxTokens: 12_000 });
  if (!report) throw new Error("Claude declined to review this channel.");
  await db.update(youtubeChannels).set({ report, reportAt: new Date() }).where(eq(youtubeChannels.id, channelRowId));
  return report;
}

const VIDEO_SYSTEM = `You improve one YouTube video's packaging and opening. Plain text, no markdown symbols, these headings on their own lines:
TITLES
HOOK
CUT
DESCRIPTION
TAGS

- TITLES: 3 options, under 50 characters, curiosity or a clear benefit, no hashtags.
- HOOK: the exact first spoken line and what's on screen in the first 2 seconds. Talk to the viewer ("you"), not about yourself, unless the story itself is the hook.
- CUT: what to remove to reach 20–35 seconds (for Shorts) or tighten the intro (long-form). If you have the script, quote the lines to cut.
- DESCRIPTION: a first line specific to this video, then at most 3 hashtags.
- TAGS: 5–8 accurate tags, comma separated, spelled correctly.
Base everything on the data given. Be brief.`;

export async function improveVideoFor(userId: number, id: number) {
  const apiKey = await requireAnthropicKey(userId);
  const [v] = await db.select().from(youtubeVideos).where(and(eq(youtubeVideos.id, id), eq(youtubeVideos.userId, userId))).limit(1);
  if (!v) throw new Error("Video not found.");
  const siblings = await db.select().from(youtubeVideos).where(eq(youtubeVideos.channelRowId, v.channelRowId));
  const ctx = channelContext(siblings.map(toAudit));
  const best = [...siblings].sort((a, b) => b.views - a.views).slice(0, 3).map((s) => `${s.title} (${s.views} views)`);

  const prompt = JSON.stringify({ video: videoFacts(v, auditVideo(toAudit(v), ctx).map((i) => i.title)), bestVideosOnThisChannel: best }, null, 1);
  const suggestions = await askClaude({ apiKey, system: VIDEO_SYSTEM, prompt, effort: "low", maxTokens: 6000 });
  if (!suggestions) throw new Error("Claude declined to review this video.");
  const [row] = await db.update(youtubeVideos).set({ suggestions, suggestionsAt: new Date() }).where(eq(youtubeVideos.id, id)).returning();
  return row;
}

// ─── Ideas (production pipeline) ──────────────────────────────────────────────

export type IdeaInput = Partial<{
  title: string; format: "short" | "long"; stage: string; hook: string; script: string; notes: string;
  videoId: string | null; dueDate: string | null; channelRowId: number | null;
}>;

function ideaSet(input: IdeaInput) {
  const set: Partial<YoutubeIdea> = { updatedAt: new Date() };
  if (input.title !== undefined) set.title = String(input.title).trim().slice(0, 255);
  if (input.format !== undefined) set.format = input.format === "long" ? "long" : "short";
  if (input.stage !== undefined) {
    if (!isIdeaStage(input.stage)) throw new Error("Unknown stage.");
    set.stage = input.stage;
  }
  if (input.hook !== undefined) set.hook = String(input.hook).slice(0, 500) || null;
  if (input.script !== undefined) set.script = String(input.script).slice(0, 10_000) || null;
  if (input.notes !== undefined) set.notes = String(input.notes).slice(0, 5000) || null;
  if (input.videoId !== undefined) set.videoId = input.videoId?.match(/[\w-]{11}/)?.[0] ?? null;
  if (input.dueDate !== undefined) set.dueDate = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;
  if (input.channelRowId !== undefined) set.channelRowId = input.channelRowId;
  return set;
}

export async function createIdeaFor(userId: number, input: IdeaInput) {
  const set = ideaSet(input);
  if (!set.title) throw new Error("Give the idea a title.");
  const [row] = await db.insert(youtubeIdeas).values({ ...set, title: set.title, userId }).returning();
  if (row.dueDate) await syncIdeaTasks(userId, row, row.id);
  return row;
}

export async function updateIdeaFor(userId: number, id: number, input: IdeaInput) {
  const set = ideaSet(input);
  if (set.title === "") throw new Error("Title can't be empty.");
  const [row] = await db.update(youtubeIdeas).set(set).where(and(eq(youtubeIdeas.id, id), eq(youtubeIdeas.userId, userId))).returning();
  if (!row) throw new Error("Idea not found.");
  if (input.dueDate !== undefined || input.title !== undefined || input.stage !== undefined) await syncIdeaTasks(userId, row, row.id);

  // Published with a video link → copy the script onto the video, so the
  // channel review can see what was actually said.
  if (row.stage === "published" && row.videoId && row.script) {
    await db
      .update(youtubeVideos)
      .set({ script: row.script })
      .where(and(eq(youtubeVideos.userId, userId), inArray(youtubeVideos.videoId, [row.videoId])));
  }
  return row;
}

export async function deleteIdeaFor(userId: number, id: number) {
  await syncIdeaTasks(userId, null, id); // open Record/Edit/Publish tasks go too
  await db.delete(youtubeIdeas).where(and(eq(youtubeIdeas.id, id), eq(youtubeIdeas.userId, userId)));
}

const SCRIPT_SYSTEM = `You write YouTube Shorts scripts for a solo creator. Plain text, no markdown symbols.
Format:
HOOK (0–2s): the first spoken line, under 12 words, plus what's on screen.
Then the beats with rough timestamps, each a spoken line and [on-screen visual].
END: a last line that loops naturally back into the hook. No "like and subscribe".
Rules: 20–35 seconds total (about 60–90 spoken words). Talk to the viewer. One idea per Short. Every line must earn its place.`;

export async function writeScriptFor(userId: number, id: number) {
  const apiKey = await requireAnthropicKey(userId);
  const [idea] = await db.select().from(youtubeIdeas).where(and(eq(youtubeIdeas.id, id), eq(youtubeIdeas.userId, userId))).limit(1);
  if (!idea) throw new Error("Idea not found.");
  const best = await db
    .select({ title: youtubeVideos.title, views: youtubeVideos.views })
    .from(youtubeVideos)
    .where(eq(youtubeVideos.userId, userId))
    .orderBy(desc(youtubeVideos.views))
    .limit(5);
  const prompt = JSON.stringify({
    idea: { title: idea.title, format: idea.format, hookDraft: idea.hook, notes: idea.notes },
    creatorsBestPerformingVideos: best,
  }, null, 1);
  const script = await askClaude({ apiKey, system: SCRIPT_SYSTEM, prompt, effort: "low", maxTokens: 5000 });
  if (!script) throw new Error("Claude declined to write this script.");
  const hook = script.match(/HOOK[^:\n]*:\s*(.+)/)?.[1]?.trim().slice(0, 500) ?? idea.hook;
  const [row] = await db
    .update(youtubeIdeas)
    .set({ script, hook, stage: idea.stage === "idea" ? "script" : idea.stage, updatedAt: new Date() })
    .where(eq(youtubeIdeas.id, id))
    .returning();
  return row;
}
