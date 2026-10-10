// Pure YouTube logic — parsing, Shorts detection, and the audit rules that
// flag what's holding a video back. No I/O; tested in youtube.test.ts.
//
// The rules are rules of thumb from how the Shorts feed works (viewers decide
// in the first 1–2 seconds; YouTube favours videos people watch to the end),
// not official YouTube thresholds — YouTube doesn't publish any.

// ─── Parsing ──────────────────────────────────────────────────────────────────

/** Accepts a channel URL, @handle, or UC… id. */
export function parseChannelInput(input: string): { id: string } | { handle: string } | null {
  const s = input.trim();
  const id = s.match(/(UC[\w-]{22})/);
  if (id) return { id: id[1] };
  const handle = s.match(/(?:youtube\.com\/)?@([\w.-]{3,30})/);
  if (handle) return { handle: handle[1] };
  if (/^[\w.-]{3,30}$/.test(s)) return { handle: s };
  return null;
}

/** ISO-8601 duration ("PT1M5S") → seconds. */
export function parseDuration(iso: string | null | undefined): number {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/**
 * The Data API has no "is Short" flag. Shorts are vertical and ≤ 3 min; a
 * #shorts tag or ≤ 60 s is the practical signal.
 */
export function isShortVideo(durationSec: number, title: string, description: string): boolean {
  if (durationSec > 180) return false;
  return durationSec <= 60 || /#shorts?\b/i.test(`${title} ${description}`);
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type Severity = "high" | "medium" | "low";
export type Issue = { code: string; severity: Severity; title: string; fix: string };

export type AuditVideo = {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  durationSec: number;
  isShort: boolean;
  views: number;
  likes: number;
  publishedAt: Date | string;
  hasCaptions?: boolean | null;
  swipeViewedPct?: number | null; // Studio: "Viewed vs. swiped away" (Shorts)
  avgViewedPct?: number | null; // Studio: average percentage viewed
};

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const likeRate = (v: { views: number; likes: number }) => (v.views > 0 ? v.likes / v.views : 0);

export type ChannelContext = { medianViews: number; medianLikeRate: number; openings: Map<string, number> };

/** Shared numbers every per-video rule compares against. */
export function channelContext(videos: AuditVideo[]): ChannelContext {
  const openings = new Map<string, number>();
  for (const v of videos) {
    const key = openingOf(v.description);
    if (key) openings.set(key, (openings.get(key) ?? 0) + 1);
  }
  return {
    medianViews: median(videos.map((v) => v.views)),
    medianLikeRate: median(videos.filter((v) => v.views >= 50).map(likeRate)),
    openings,
  };
}

/** First real sentence of a description, normalised — to spot copy-paste intros. */
function openingOf(description: string): string {
  const firstBlock = description
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 20);
  return firstBlock ? firstBlock.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 60) : "";
}

export function auditVideo(v: AuditVideo, ctx: ChannelContext): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, severity: Severity, title: string, fix: string) => issues.push({ code, severity, title, fix });

  if (v.isShort) {
    if (v.swipeViewedPct != null && v.swipeViewedPct < 60) {
      add("swiped_away", "high", `${100 - v.swipeViewedPct}% swipe away immediately`,
        "The first 1–2 seconds don't stop the scroll. Open on the most surprising visual or line — no intro, no context-setting.");
    }
    if (v.avgViewedPct != null && v.avgViewedPct < 70) {
      add("low_retention", "high", `Viewers watch only ${v.avgViewedPct}% on average`,
        "Cut every sentence that isn't the point, and end where it can loop back to the start.");
    }
    if (v.durationSec > 45) {
      add("long_short", "medium", `${v.durationSec}s is long for a Short`,
        "Aim for 20–35 seconds. Shorter Shorts are watched to the end more often, which is what the feed rewards.");
    }
  }

  if (ctx.medianViews >= 20 && v.views < ctx.medianViews * 0.25 && ageDays(v.publishedAt) >= 2) {
    add("underperformer", "medium", `Far below your usual views (${v.views} vs ~${Math.round(ctx.medianViews)})`,
      "Compare its opening with your best video — that's usually where the difference is.");
  }
  if (v.views >= 100 && ctx.medianLikeRate > 0 && likeRate(v) < ctx.medianLikeRate * 0.5) {
    add("weak_engagement", "medium", "Few likes for its views",
      "People watched but didn't care. A clearer payoff or a stronger opinion usually lifts this.");
  }

  const hashtagsInTitle = (v.title.match(/#\w+/g) ?? []).length;
  if (hashtagsInTitle > 0) {
    add("title_hashtags", "low", "Hashtags in the title",
      "They eat title space and look spammy. Move 1–3 hashtags to the description.");
  }
  if (v.title.replace(/#\w+/g, "").trim().length > 60) {
    add("long_title", "low", "Title gets cut off",
      "Keep it under ~50 characters so the whole promise is visible on a phone.");
  }
  if (v.tags.length > 15 || v.tags.filter((t) => /\b20\d\d\b/.test(t)).length >= 3) {
    add("tag_stuffing", "low", `${v.tags.length} tags, many generic`,
      "YouTube says tags play a minimal role. Keep 5–8 accurate ones (and fix typos); spend the time on the hook instead.");
  }
  const opening = openingOf(v.description);
  if (opening && (ctx.openings.get(opening) ?? 0) >= 3) {
    add("boilerplate_description", "low", "Description starts like every other video",
      "Make the first line about this video — it's what shows in search and under the title.");
  }
  if (!v.isShort && v.hasCaptions === false) {
    add("no_captions", "low", "No uploaded captions", "Upload or correct captions — many people watch muted.");
  }
  return issues;
}

function ageDays(d: Date | string) {
  return (Date.now() - new Date(d).getTime()) / 86_400_000;
}

/** Problems you only see looking at the channel as a whole. */
export function channelFindings(videos: AuditVideo[]): Issue[] {
  const issues: Issue[] = [];
  if (videos.length < 2) return issues;
  const byDate = [...videos].sort((a, b) => +new Date(a.publishedAt) - +new Date(b.publishedAt));
  const total = videos.reduce((s, v) => s + v.views, 0);

  const top = [...videos].sort((a, b) => b.views - a.views)[0];
  if (total > 0 && top.views / total >= 0.5 && videos.length >= 4) {
    issues.push({
      code: "one_hit",
      severity: "high",
      title: `One video has ${Math.round((top.views / total) * 100)}% of all views`,
      fix: `“${top.title}” found an audience — the videos after it are about something else, so that audience swipes past them. Make more for the people who watched it.`,
    });
  }

  if (byDate.length >= 6) {
    const half = Math.floor(byDate.length / 2);
    const early = median(byDate.slice(0, half).map((v) => v.views));
    const recent = median(byDate.slice(-Math.min(5, half)).map((v) => v.views));
    if (early > 0 && recent < early * 0.35) {
      issues.push({
        code: "declining",
        severity: "high",
        title: "Views are falling with each upload",
        fix: "Each new video is tested on a small audience first; if they swipe, the next one gets an even smaller test. Fix the opening before posting more.",
      });
    }
  }

  let maxGap = 0;
  for (let i = 1; i < byDate.length; i++) {
    maxGap = Math.max(maxGap, (+new Date(byDate[i].publishedAt) - +new Date(byDate[i - 1].publishedAt)) / 86_400_000);
  }
  if (maxGap > 45) {
    issues.push({
      code: "upload_gap",
      severity: "medium",
      title: `A ${Math.round(maxGap)}-day gap between uploads`,
      fix: "Momentum resets after long breaks. A steady 2–4 Shorts a week beats bursts.",
    });
  }

  const shorts = videos.filter((v) => v.isShort);
  const avgLen = shorts.length ? shorts.reduce((s, v) => s + v.durationSec, 0) / shorts.length : 0;
  if (shorts.length >= 3 && avgLen > 45) {
    issues.push({
      code: "shorts_too_long",
      severity: "medium",
      title: `Your Shorts average ${Math.round(avgLen)}s`,
      fix: "Your best-liked Shorts are your shortest. Target 20–35s.",
    });
  }
  return issues;
}

export const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// ─── Work pipeline ────────────────────────────────────────────────────────────

export const IDEA_STAGES = ["idea", "script", "record", "edit", "ready", "published"] as const;
export type IdeaStage = (typeof IDEA_STAGES)[number];
export const STAGE_LABEL: Record<IdeaStage, string> = {
  idea: "Idea",
  script: "Script",
  record: "Record",
  edit: "Edit",
  ready: "Ready",
  published: "Published",
};

export function isIdeaStage(v: unknown): v is IdeaStage {
  return typeof v === "string" && (IDEA_STAGES as readonly string[]).includes(v);
}

/** Unfinished work that hasn't moved in a week. */
export function isStalled(idea: { stage: string; updatedAt: Date | string | null }, now = new Date()): boolean {
  if (idea.stage === "published" || idea.stage === "idea" || !idea.updatedAt) return false;
  return now.getTime() - new Date(idea.updatedAt).getTime() > 7 * 86_400_000;
}

// ─── Content calendar ─────────────────────────────────────────────────────────

export const CALENDAR_STEPS = [
  { phase: "Record", offset: -2 },
  { phase: "Edit", offset: -1 },
  { phase: "Publish", offset: 0 },
] as const;

/** Record / Edit / Publish dates for a publish date — never before today. */
export function ideaTaskPlan(publishDate: string, today: string): { phase: string; dueDate: string }[] {
  const base = new Date(publishDate + "T12:00:00");
  return CALENDAR_STEPS.map(({ phase, offset }) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { phase, dueDate: key < today ? today : key };
  });
}
