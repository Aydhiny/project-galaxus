// Claude jobs that aren't voice commands — pure prompt builders and result
// parsers (tested in claude-jobs.test.ts). They all run on the same Claude
// Code runner as voice (your subscription), see lib/services/claude-jobs.ts.

import type { PlaytestTheme } from "@/lib/db/schema";

export const JOB_KINDS = ["voice", "devlog", "hooks", "comment_replies", "playtest"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_LABEL: Record<JobKind, string> = {
  voice: "Voice command",
  devlog: "Devlog script",
  hooks: "Hook lab",
  comment_replies: "Comment replies",
  playtest: "Playtest themes",
};

/** Every non-voice job answers with JSON only — no tools, no prose. */
const JSON_ONLY = "Do not call any tools. Reply with ONLY the JSON object, no other text.";

/** Pull the first JSON object out of a reply (handles ```json fences and chatter). */
export function parseJsonReply<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text].filter(Boolean) as string[];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ─── Devlog from commits ──────────────────────────────────────────────────────

export type DevlogCommit = { sha: string; message: string; date: string };
export type DevlogResult = { title: string; hook: string; script: string; shots: string[] };

export function devlogPrompt(p: { game: string; commits: DevlogCommit[]; bestVideos: string[] }) {
  return {
    system: `You turn a solo game developer's recent git commits into ONE YouTube Shorts devlog script.
The audience is indie devs and people curious about game development; most of them don't know the game yet.
Find the single most interesting change (a visual, a struggle, a before/after) — not a changelog.
Hook: first spoken line, under 12 words, talks to the viewer or states a surprising result. No "In this devlog", no "So".
Script: 20–35 seconds (60–90 words) with [on-screen] notes, ending on a line that loops back to the hook.
Shots: 3–6 concrete things to screen-record or film.
${JSON_ONLY}
Shape: {"title": string (under 50 chars, no hashtags), "hook": string, "script": string, "shots": string[]}`,
    prompt: [
      `Game: ${p.game}`,
      `Best-performing videos on the channel (for tone and audience): ${p.bestVideos.join(" | ") || "none yet"}`,
      `Commits since the last devlog (newest first):`,
      ...p.commits.slice(0, 60).map((c) => `- ${c.date.slice(0, 10)} ${clip(c.message.split("\n")[0], 140)}`),
    ].join("\n"),
  };
}

export function parseDevlog(text: string): DevlogResult | null {
  const j = parseJsonReply<Partial<DevlogResult>>(text);
  if (!j?.title || !j.script) return null;
  return {
    title: String(j.title).slice(0, 120),
    hook: String(j.hook ?? "").slice(0, 300),
    script: String(j.script).slice(0, 6000),
    shots: Array.isArray(j.shots) ? j.shots.map(String).slice(0, 8) : [],
  };
}

// ─── Hook lab ─────────────────────────────────────────────────────────────────

export function hooksPrompt(p: { title: string; notes?: string | null; script?: string | null; format: string; bestVideos: string[] }) {
  return {
    system: `You write opening lines (hooks) for YouTube ${p.format === "long" ? "videos" : "Shorts"}.
Write 10 different hooks for the idea, each under 12 words, each a different angle: a bold claim, a question, a mistake, a result, a challenge, a number, a "you" statement, a before/after, a confession, a warning.
No clickbait the video can't deliver, no emojis, no hashtags.
${JSON_ONLY}
Shape: {"hooks": string[10]}`,
    prompt: [
      `Idea: ${p.title}`,
      p.notes ? `Notes: ${clip(p.notes, 800)}` : "",
      p.script ? `Draft script: ${clip(p.script, 1500)}` : "",
      `What has worked on this channel: ${p.bestVideos.join(" | ") || "unknown"}`,
    ].filter(Boolean).join("\n"),
  };
}

export function parseHooks(text: string): string[] {
  const j = parseJsonReply<{ hooks?: unknown }>(text);
  return Array.isArray(j?.hooks) ? j!.hooks.map((h) => String(h).trim()).filter(Boolean).slice(0, 12) : [];
}

// ─── Comment replies ──────────────────────────────────────────────────────────

export type CommentForReply = { id: string; author: string; text: string; video: string };

export function commentRepliesPrompt(p: { channel: string; comments: CommentForReply[] }) {
  return {
    system: `You draft replies to YouTube comments for the creator of the channel "${p.channel}" (a solo indie game developer).
Voice: warm, short (1–2 sentences), genuine, a little playful. Reply in the comment's language.
Answer questions directly. Thank people specifically, not generically. When natural, end with a light question to keep the conversation going.
Never promise release dates, never argue with critics — acknowledge and move on. No hashtags.
${JSON_ONLY}
Shape: {"replies": [{"id": string, "reply": string}]}`,
    prompt: p.comments.map((c) => `[${c.id}] on "${clip(c.video, 80)}" — ${c.author}: ${clip(c.text, 500)}`).join("\n"),
  };
}

export function parseReplies(text: string): { id: string; reply: string }[] {
  const j = parseJsonReply<{ replies?: { id?: unknown; reply?: unknown }[] }>(text);
  return (j?.replies ?? [])
    .filter((r) => r && r.id && r.reply)
    .map((r) => ({ id: String(r.id), reply: String(r.reply).slice(0, 1000) }));
}

// ─── Playtest themes ──────────────────────────────────────────────────────────

export type FeedbackForThemes = { id: number; tester: string | null; build: string | null; rating: number | null; text: string };

export function playtestPrompt(p: { game: string; feedback: FeedbackForThemes[] }) {
  return {
    system: `You group playtest feedback for the game "${p.game}" into themes so the developer knows what to fix first.
Merge feedback that is about the same underlying problem. Count how many entries mention each theme.
Severity: high = blocks or frustrates players, medium = noticeable friction, low = polish or nice-to-have.
For each theme give 1–3 short verbatim examples and ONE short task title (2–6 words) the developer can do.
Sort by severity, then count. At most 8 themes.
${JSON_ONLY}
Shape: {"themes": [{"theme": string, "count": number, "severity": "high"|"medium"|"low", "examples": string[], "task": string}]}`,
    prompt: p.feedback
      .slice(0, 200)
      .map((f) => `- [${f.id}]${f.build ? ` build ${f.build}` : ""}${f.rating ? ` ${f.rating}/5` : ""}${f.tester ? ` (${f.tester})` : ""}: ${clip(f.text, 400)}`)
      .join("\n"),
  };
}

export function parseThemes(text: string): PlaytestTheme[] {
  const j = parseJsonReply<{ themes?: Partial<PlaytestTheme>[] }>(text);
  const sev = (s: unknown): PlaytestTheme["severity"] => (s === "high" || s === "low" ? s : "medium");
  return (j?.themes ?? [])
    .filter((t) => t && t.theme)
    .slice(0, 8)
    .map((t) => ({
      theme: String(t.theme).slice(0, 120),
      count: Math.max(1, Math.round(Number(t.count) || 1)),
      severity: sev(t.severity),
      examples: Array.isArray(t.examples) ? t.examples.map(String).slice(0, 3) : [],
      task: String(t.task ?? t.theme).slice(0, 80),
    }));
}
