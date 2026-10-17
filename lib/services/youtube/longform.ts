// Long-form studio: pitch videos from what the channel's numbers and the
// game's commits say, write the full script with a shot list, and turn a
// recording's transcript into a rough cut. Pure parts live in
// lib/youtube-longform.ts; this file is the data + model calls.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys, gameCommits, youtubeChannels, youtubeEdits, youtubeIdeas, youtubeVideos } from "@/lib/db/schema";
import { channelFindings, type AuditVideo } from "@/lib/youtube";
import {
  extractJson, parseEditDecision, parseLongScript, parsePitches, scriptText, transcriptForPrompt,
  type LongPlan, type Segment, type Span,
} from "@/lib/youtube-longform";
import { saveFreeKeyFor } from "@/lib/services/free-llm";
import { askBrain, type BrainPref } from "./brain";

// ─── Context the model gets ───────────────────────────────────────────────────

async function channelBrief(userId: number, channelRowId: number | null) {
  const [ch] = channelRowId
    ? await db.select().from(youtubeChannels).where(and(eq(youtubeChannels.id, channelRowId), eq(youtubeChannels.userId, userId))).limit(1)
    : await db.select().from(youtubeChannels).where(eq(youtubeChannels.userId, userId)).limit(1);
  const videos = ch ? await db.select().from(youtubeVideos).where(eq(youtubeVideos.channelRowId, ch.id)).orderBy(desc(youtubeVideos.publishedAt)).limit(60) : [];
  const commits = await db.select({ message: gameCommits.message, at: gameCommits.committedAt }).from(gameCommits)
    .where(eq(gameCommits.userId, userId)).orderBy(desc(gameCommits.committedAt)).limit(40);
  const audit: AuditVideo[] = videos.map((v) => ({ ...v, description: v.description ?? "", tags: v.tags ?? [] }));
  return {
    channel: ch ? { title: ch.title, subscribers: ch.subscribers, totalViews: ch.totalViews, about: ch.description?.slice(0, 500) ?? "" } : null,
    channelFlags: channelFindings(audit).map((i) => `${i.title} — ${i.fix}`),
    earlierReview: ch?.report?.slice(0, 2500) ?? null,
    videosNewestFirst: videos.map((v) => ({
      title: v.title, format: v.isShort ? "Short" : "Long", seconds: v.durationSec, views: v.views, likes: v.likes, comments: v.comments,
      published: v.publishedAt.toISOString().slice(0, 10),
    })),
    // What the creator actually built lately — real material for devlogs and tutorials.
    recentGameCommits: commits.map((c) => `${c.at.toISOString().slice(0, 10)} ${c.message.split("\n")[0].slice(0, 160)}`),
  };
}

const CREATOR = `The creator is a solo developer who films themself (face cam + screen recording) and edits with help from AI.
Content pillars, in the creator's words: game dev, overall development, tutorials, and their own game (an indie game in development — see the commits).
They record easily, so ideas should be things they can film at their desk with their own projects; no expensive production.`;

// ─── Pitches ──────────────────────────────────────────────────────────────────

const PITCH_SYSTEM = `You are a YouTube strategist for small, technical creators. You pitch LONG-FORM videos (8–25 minutes), not Shorts.
${CREATOR}

Use the data: which videos found an audience (views, likes, comments relative to the channel), what flopped, what the earlier review said, and what the creator built recently.
A long-form video earns its length: a real problem solved, a story with stakes, or a build the viewer can follow.

Answer with JSON only, exactly this shape:
{"ideas":[{"title":"under 60 chars, a clear promise or curiosity, no clickbait lies","topic":"one line","angle":"why someone clicks — the promise","why":"evidence from THIS channel's data or commits (name videos/numbers)","viewer":"who it's for","minutes":12,"pillar":"gamedev|dev|tutorial|my-game","outline":["5–8 short section names in order"]}]}
Rules: never invent numbers; mix pillars unless the creator steers otherwise; at least one idea should serve the audience of the channel's best-performing video.`;

export async function pitchLongformFor(userId: number, input: { channelRowId: number | null; steer?: string; count?: number; prefer?: BrainPref }) {
  const count = Math.max(1, Math.min(8, Math.round(input.count ?? 5)));
  const brief = await channelBrief(userId, input.channelRowId);
  const existing = await db.select({ title: youtubeIdeas.title }).from(youtubeIdeas).where(eq(youtubeIdeas.userId, userId)).orderBy(desc(youtubeIdeas.updatedAt)).limit(40);
  const prompt = JSON.stringify({
    task: `Pitch ${count} long-form videos.`,
    creatorSteer: input.steer?.trim().slice(0, 600) || null,
    ...brief,
    alreadyInPipeline: existing.map((e) => e.title), // don't repeat these
  }, null, 1);

  const { text, by } = await askBrain(userId, { system: PITCH_SYSTEM, prompt, maxTokens: 6000, prefer: input.prefer });
  const pitches = parsePitches(extractJson(text)).slice(0, count);
  if (!pitches.length) throw new Error(`${by} returned no usable ideas — try again.`);
  const rows = await db.insert(youtubeIdeas).values(pitches.map(({ title, ...pitch }) => ({
    userId, channelRowId: input.channelRowId, title, format: "long", stage: "idea", source: "longform", brain: by,
    notes: [pitch.angle, pitch.why].filter(Boolean).join("\n\n").slice(0, 5000) || null,
    plan: { pitch } satisfies LongPlan,
  }))).returning({ id: youtubeIdeas.id });
  return { added: rows.length, by };
}

// ─── Full script ──────────────────────────────────────────────────────────────

const SCRIPT_SYSTEM = `You write complete LONG-FORM YouTube scripts for a solo creator who records face cam + screen.
${CREATOR}

Write every spoken line in full, in the creator's voice: first person, casual, specific, no filler, no "in this video I will…" intro.
For each line say what's ON SCREEN ("show"): face cam, a specific screen recording (which app/file/scene), game footage, a diagram, code close-up, text overlay.

Answer with JSON only, exactly this shape:
{"hook":[{"say":"…","show":"…"}],
 "sections":[{"heading":"…","minutes":2,"beats":[{"say":"…","show":"…"}]}],
 "outro":[{"say":"…","show":"…"}],
 "titles":["3 options under 60 chars"],
 "thumbnail":"one concrete thumbnail idea: image + max 4 words of text",
 "description":"first two lines specific to this video, then a short summary; no hashtag spam",
 "shots":[{"shot":"what to capture","how":"how/where to record it, settings, what to prepare"}]}
Rules:
- HOOK is the first ~30 seconds: open on the most interesting moment or the result, state the payoff, no channel intro.
- Total spoken words ≈ 140 × the target minutes. Every section moves the viewer forward; open loops get closed.
- Tutorials: real steps someone can follow; name actual tools, menus and code concepts.
- "shots" is the recording checklist: every screen recording, footage clip or asset the "show" lines need, grouped so the creator can record in one sitting.
- Outro: one line pointing to the next video that fits; no begging for likes.`;

export async function writeLongScriptFor(userId: number, ideaId: number, prefer?: BrainPref) {
  const [idea] = await db.select().from(youtubeIdeas).where(and(eq(youtubeIdeas.id, ideaId), eq(youtubeIdeas.userId, userId))).limit(1);
  if (!idea) throw new Error("Idea not found.");
  const brief = await channelBrief(userId, idea.channelRowId);
  const pitch = idea.plan?.pitch;
  const prompt = JSON.stringify({
    video: { title: idea.title, ...(pitch ?? {}), targetMinutes: pitch?.minutes ?? 12, creatorNotes: idea.notes, hookDraft: idea.hook },
    channel: brief.channel,
    bestVideos: [...brief.videosNewestFirst].sort((a, b) => b.views - a.views).slice(0, 5),
    recentGameCommits: brief.recentGameCommits.slice(0, 25),
  }, null, 1);

  const { text, by } = await askBrain(userId, { system: SCRIPT_SYSTEM, prompt, maxTokens: 16_000, prefer });
  const script = parseLongScript(extractJson(text));
  const plan: LongPlan = { pitch: pitch ?? { topic: idea.title, angle: "", why: "", viewer: "", minutes: 12, pillar: "dev", outline: script.sections.map((s) => s.heading) }, script };
  const [row] = await db.update(youtubeIdeas).set({
    plan, brain: by, format: "long",
    script: scriptText(script).slice(0, 10_000),
    hook: script.hook[0]?.say.slice(0, 500) ?? idea.hook,
    stage: idea.stage === "idea" ? "script" : idea.stage,
    updatedAt: new Date(),
  }).where(eq(youtubeIdeas.id, ideaId)).returning();
  return row;
}

// ─── Recording → rough cut ────────────────────────────────────────────────────

const MAX_SEGMENTS = 4000;

const cleanSpans = <T extends Span>(xs: T[], duration: number, extra: (x: T) => Partial<T> = () => ({})) =>
  xs.flatMap((x) => {
    const start = Number(x.start), end = Number(x.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0 || start > duration + 1) return [];
    return [{ start: Math.round(start * 1000) / 1000, end: Math.round(Math.min(end, duration) * 1000) / 1000, ...extra(x) } as T];
  });

export async function createEditFor(userId: number, input: { title: string; fileName: string; durationSec: number; ideaId: number | null; segments: Segment[]; silences: Span[] }) {
  const durationSec = Number(input.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 4 * 3600) throw new Error("Recordings up to 4 hours.");
  const segments = cleanSpans((input.segments ?? []).slice(0, MAX_SEGMENTS), durationSec, (s) => ({ text: String(s.text ?? "").trim().slice(0, 1000) }))
    .filter((s) => s.text).sort((a, b) => a.start - b.start);
  if (segments.length < 3) throw new Error("The transcript is (almost) empty — is there speech in this recording?");
  const silences = cleanSpans((input.silences ?? []).slice(0, 20_000), durationSec);
  let ideaId: number | null = null;
  if (input.ideaId) {
    const [idea] = await db.select({ id: youtubeIdeas.id }).from(youtubeIdeas).where(and(eq(youtubeIdeas.id, input.ideaId), eq(youtubeIdeas.userId, userId))).limit(1);
    ideaId = idea?.id ?? null;
  }
  const [row] = await db.insert(youtubeEdits).values({
    userId, ideaId, title: String(input.title || input.fileName).slice(0, 255), fileName: String(input.fileName).slice(0, 255),
    durationSec, segments, silences,
  }).returning({ id: youtubeEdits.id });
  if (ideaId) await db.update(youtubeIdeas).set({ stage: "edit", updatedAt: new Date() }).where(and(eq(youtubeIdeas.id, ideaId), eq(youtubeIdeas.userId, userId)));
  return row;
}

const EDIT_SYSTEM = `You are the editor of a solo creator's long-form YouTube video. You get the raw recording's transcript as numbered lines ([n] time text) and, when there is one, the planned script with what should be on screen.
Your job is the rough cut: decide which LINES to remove. You never give timestamps — only line numbers.

Cut:
- retakes: when the creator restarts or repeats a sentence, keep only the LAST complete take and cut the earlier ones;
- false starts, "wait, let me do that again", mumbled half-sentences, talking to themself about the recording;
- rambling that repeats a point already made, and dead tangents.
Keep everything else — the goal is tight but natural, not a highlight reel. When unsure, keep.

Also:
- "show": where to put B-roll / screen recordings / overlays — use the script's show notes, matched to the line where that thing is said;
- "chapters": 4–10 chapters at the line where each part starts; the first at the first kept line;
- "titles": 3 options under 60 chars that match what was ACTUALLY said;
- "description": 2 specific opening lines + short summary;
- "notes": anything the creator should fix by hand (missing explanation, a part worth re-recording).

Answer with JSON only:
{"cut":[{"seg":12,"why":"retake of 13"}],"show":[{"seg":20,"what":"screen recording of …"}],"chapters":[{"seg":0,"title":"…"}],"titles":["…"],"description":"…","notes":"…"}`;

export async function planEditFor(userId: number, id: number, prefer?: BrainPref) {
  const [edit] = await db.select().from(youtubeEdits).where(and(eq(youtubeEdits.id, id), eq(youtubeEdits.userId, userId))).limit(1);
  if (!edit) throw new Error("Edit not found.");
  const [idea] = edit.ideaId ? await db.select().from(youtubeIdeas).where(eq(youtubeIdeas.id, edit.ideaId)).limit(1) : [];
  const prompt = [
    `VIDEO: ${idea?.title ?? edit.title} (raw recording ${Math.round(edit.durationSec / 60)} min, ${edit.segments.length} lines)`,
    idea?.script ? `PLANNED SCRIPT (what was meant to be said and shown):\n${idea.script.slice(0, 12_000)}` : "No script — judge from the transcript.",
    `TRANSCRIPT:\n${transcriptForPrompt(edit.segments)}`,
  ].join("\n\n");
  const { text, by } = await askBrain(userId, { system: EDIT_SYSTEM, prompt, maxTokens: 8000, prefer, claudeModel: "claude-sonnet-5-5" });
  const decision = parseEditDecision(extractJson(text), edit.segments.length);
  await db.update(youtubeEdits).set({ decision, brain: by, updatedAt: new Date() }).where(eq(youtubeEdits.id, id));
  return { by, cuts: decision.cut.length };
}

/** Your own tweaks: put a line back, or cut one the model kept. */
export async function toggleCutFor(userId: number, id: number, seg: number) {
  const [edit] = await db.select().from(youtubeEdits).where(and(eq(youtubeEdits.id, id), eq(youtubeEdits.userId, userId))).limit(1);
  if (!edit?.decision) throw new Error("Plan the edit first.");
  if (!Number.isInteger(seg) || seg < 0 || seg >= edit.segments.length) throw new Error("No such line.");
  const has = edit.decision.cut.some((c) => c.seg === seg);
  const cut = has ? edit.decision.cut.filter((c) => c.seg !== seg) : [...edit.decision.cut, { seg, why: "cut by you" }].sort((a, b) => a.seg - b.seg);
  await db.update(youtubeEdits).set({ decision: { ...edit.decision, cut }, updatedAt: new Date() }).where(eq(youtubeEdits.id, id));
}

export async function editFor(userId: number, id: number) {
  const [edit] = await db.select().from(youtubeEdits).where(and(eq(youtubeEdits.id, id), eq(youtubeEdits.userId, userId))).limit(1);
  if (!edit) throw new Error("Edit not found.");
  return edit;
}

export async function editsFor(userId: number) {
  const rows = await db.select({
    id: youtubeEdits.id, title: youtubeEdits.title, ideaId: youtubeEdits.ideaId, fileName: youtubeEdits.fileName,
    durationSec: youtubeEdits.durationSec, brain: youtubeEdits.brain, decision: youtubeEdits.decision, createdAt: youtubeEdits.createdAt,
  }).from(youtubeEdits).where(eq(youtubeEdits.userId, userId)).orderBy(desc(youtubeEdits.createdAt)).limit(20);
  return rows.map(({ decision, ...r }) => ({ ...r, planned: !!decision, cuts: decision?.cut.length ?? 0 }));
}

export async function deleteEditFor(userId: number, id: number) {
  await db.delete(youtubeEdits).where(and(eq(youtubeEdits.id, id), eq(youtubeEdits.userId, userId)));
}

/** Groq key straight from the YouTube page — it lands in Ops → Free models too (one key, both uses). */
export async function saveGroqKeyFor(userId: number, key: string) {
  // Keep the chat model already picked for Groq in Ops (saveFreeKeyFor would reset it to the catalog default).
  const [existing] = await db.select({ model: freeLlmKeys.model }).from(freeLlmKeys)
    .where(and(eq(freeLlmKeys.userId, userId), eq(freeLlmKeys.provider, "groq"))).limit(1);
  await saveFreeKeyFor(userId, { provider: "groq", key, model: existing?.model });
}
