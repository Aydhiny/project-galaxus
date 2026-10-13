// Scout: finds Reddit threads where people say how they earn money, reads their
// comments, and has Claude (on your runner, no tools) extract the concrete claims.
//
// Reddit's public feeds allow roughly ONE request a minute without an app key
// (measured: x-ratelimit-remaining hits 0 after a single call). So the work is
// split into single-request steps that the scheduler runs on separate beats:
//   scanScoutFor        one listing request  → new threads ("new")
//   pullNextCommentsFor one thread's comments → "ready"      (one per beat)
//   queueReadyFor       ready threads → Claude job → "queued" → "analyzed"
// Nothing here posts, votes or comments — it only reads.

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoutThreads, userSettings } from "@/lib/db/schema";
import { parseRedditRss } from "@/lib/gigs";
import {
  DEFAULT_SCOUT_PROFILE, DEFAULT_SCOUT_SUBS, looksLikeMoneyTalk, normalizeSubs, parseScout, parseThreadComments, scoutPrompt, threadScore,
  type ThreadComment,
} from "@/lib/scout";
import { claudeHealthy, enqueueJobFor } from "@/lib/services/claude-jobs";
import { notifyUser } from "@/lib/services/outreach/push";

// Reddit asks for a descriptive User-Agent; generic ones are throttled first.
const UA = "web:galaxus-scout:1.0 (personal research tool; read-only)";
const MAX_NEW_PER_SCAN = 8;
const MAX_AGE_DAYS = 9; // "top of the week" can include older posts
const BATCH = 5; // threads per Claude job
const QUEUED_TIMEOUT_MS = 6 * 3_600_000; // a job that never came back goes back in line
const READY_WAIT_MS = 2 * 3_600_000; // don't wait forever for the last comment fetches
const KEEP_DAYS = 60;
const STRONG_SCORE = 70;

class FeedError extends Error {
  constructor(readonly status: number) {
    super(
      status === 429
        ? "Reddit is rate-limiting this server (about one request a minute without an app key). Try again in a few minutes."
        : `Reddit answered ${status}`,
    );
  }
}

async function getFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/atom+xml, application/xml;q=0.9" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new FeedError(res.status);
  return res.text();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function scoutSettingsFor(userId: number) {
  const [s] = await db
    .select({ profile: userSettings.scoutProfile, subs: userSettings.scoutSubs })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const subs = s?.subs ? normalizeSubs(s.subs) : [];
  return {
    profile: s?.profile?.trim() || DEFAULT_SCOUT_PROFILE,
    subs: subs.length ? subs : DEFAULT_SCOUT_SUBS,
  };
}

export async function saveScoutSettingsFor(userId: number, patch: { profile?: string; subs?: string }) {
  const set: { scoutProfile?: string | null; scoutSubs?: string | null } = {};
  if (patch.profile !== undefined) set.scoutProfile = patch.profile.trim().slice(0, 1500) || null;
  if (patch.subs !== undefined) {
    const subs = normalizeSubs(patch.subs);
    set.scoutSubs = subs.length ? subs.join(" ") : null;
  }
  if (Object.keys(set).length === 0) return;
  await db.insert(userSettings).values({ userId, ...set }).onConflictDoUpdate({ target: userSettings.userId, set });
}

// ─── Step 1: one listing request ──────────────────────────────────────────────

/** Fetch this week's top posts across the subreddits; store the ones that talk about money. */
export async function scanScoutFor(userId: number) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  await db.delete(scoutThreads).where(and(eq(scoutThreads.userId, userId), lt(scoutThreads.createdAt, cutoff), sql`${scoutThreads.mark} <> 'saved'`));

  const { subs } = await scoutSettingsFor(userId);
  const posts = parseRedditRss(await getFeed(`https://www.reddit.com/r/${subs.join("+")}/top/.rss?t=week&limit=100`));
  const known = new Set((await db.select({ id: scoutThreads.threadId }).from(scoutThreads).where(eq(scoutThreads.userId, userId))).map((r) => r.id));
  const now = Date.now();

  const fresh = posts
    .map((p) => ({ p, threadId: p.externalId.replace(/^reddit:/, "") }))
    .filter(({ p, threadId }) =>
      /^[a-z0-9]{3,20}$/i.test(threadId) &&
      !known.has(threadId) &&
      (!p.postedAt || now - p.postedAt.getTime() <= MAX_AGE_DAYS * 86_400_000) &&
      looksLikeMoneyTalk(p.title, p.body))
    .slice(0, MAX_NEW_PER_SCAN); // the feed is already ordered best-first

  if (fresh.length) {
    await db.insert(scoutThreads).values(fresh.map(({ p, threadId }) => ({
      userId,
      threadId,
      subreddit: p.subreddit?.replace(/[^\w]/g, "").slice(0, 40) || null,
      title: p.title.slice(0, 300),
      url: p.url,
      author: p.author?.slice(0, 60) ?? null,
      body: p.body.slice(0, 6000),
      postedAt: p.postedAt,
    }))).onConflictDoNothing();
  }
  return { fetched: posts.length, added: fresh.length };
}

// ─── Step 2: one thread's comments per beat ───────────────────────────────────

export async function pullNextCommentsFor(userId: number) {
  const [t] = await db
    .select()
    .from(scoutThreads)
    .where(and(eq(scoutThreads.userId, userId), eq(scoutThreads.status, "new")))
    .orderBy(asc(scoutThreads.id))
    .limit(1);
  if (!t) return { pulled: 0, queued: await queueReadyFor(userId) };

  let comments: ThreadComment[] = [];
  try {
    comments = parseThreadComments(await getFeed(`https://www.reddit.com/comments/${t.threadId}/.rss?limit=40&sort=top`));
  } catch (e) {
    if (e instanceof FeedError && e.status === 429) return { pulled: 0, waiting: "rate limited" };
    // Anything else (403, timeout): analyse the post without its comments rather than stall.
  }
  await db.update(scoutThreads).set({ comments: comments.slice(0, 20), status: "ready" }).where(eq(scoutThreads.id, t.id));
  return { pulled: 1, comments: comments.length, queued: await queueReadyFor(userId) };
}

// ─── Step 3: hand ready threads to Claude ─────────────────────────────────────

/** Returns how many threads were queued. */
export async function queueReadyFor(userId: number): Promise<number> {
  // A job that never came back (runner down, failed) puts its threads back in line.
  await db.update(scoutThreads).set({ status: "ready" })
    .where(and(eq(scoutThreads.userId, userId), eq(scoutThreads.status, "queued"), lt(scoutThreads.queuedAt, new Date(Date.now() - QUEUED_TIMEOUT_MS))));

  const open = await db
    .select({ id: scoutThreads.id, status: scoutThreads.status, createdAt: scoutThreads.createdAt })
    .from(scoutThreads)
    .where(and(eq(scoutThreads.userId, userId), inArray(scoutThreads.status, ["new", "ready"])))
    .orderBy(asc(scoutThreads.id));
  const ready = open.filter((r) => r.status === "ready");
  if (ready.length === 0) return 0;
  // Wait for the remaining comment fetches so one job sees full batches — but not forever.
  const stillFetching = open.length > ready.length;
  const oldest = ready[0].createdAt?.getTime() ?? Date.now();
  if (stillFetching && Date.now() - oldest < READY_WAIT_MS) return 0;
  if (!(await claudeHealthy(userId))) return 0;

  let queued = 0;
  for (let i = 0; i < ready.length; i += BATCH) {
    const ids = ready.slice(i, i + BATCH).map((r) => r.id);
    await db.update(scoutThreads).set({ status: "queued", queuedAt: new Date() }).where(inArray(scoutThreads.id, ids));
    try {
      await enqueueJobFor(userId, "scout", `Scout: ${ids.length} thread${ids.length === 1 ? "" : "s"}`, { threadIds: ids });
      queued += ids.length;
    } catch {
      // Hourly Claude-job limit hit: back in line, try again on a later beat.
      await db.update(scoutThreads).set({ status: "ready", queuedAt: null }).where(inArray(scoutThreads.id, ids));
      break;
    }
  }
  return queued;
}

// ─── The Claude job (called from lib/services/claude-jobs.ts) ─────────────────

export async function buildScoutPrompt(userId: number, ids: number[]) {
  const rows = ids.length
    ? await db.select().from(scoutThreads).where(and(eq(scoutThreads.userId, userId), inArray(scoutThreads.id, ids.slice(0, BATCH))))
    : [];
  if (rows.length === 0) throw new Error("Nothing to analyse.");
  const { profile } = await scoutSettingsFor(userId);
  return scoutPrompt({
    profile,
    threads: rows.map((r) => ({
      id: r.threadId,
      sub: (r.subreddit ?? "").replace(/[^\w]/g, ""),
      title: r.title,
      body: r.body ?? "",
      comments: r.comments,
    })),
  });
}

export async function applyScoutResult(userId: number, ids: number[], text: string): Promise<string> {
  const results = parseScout(text);
  if (!results) throw new Error("Claude's Scout reply couldn't be read.");
  const rows = ids.length ? await db.select().from(scoutThreads).where(and(eq(scoutThreads.userId, userId), inArray(scoutThreads.id, ids))) : [];
  const byThread = new Map(results.map((r) => [r.id, r]));

  let claimCount = 0;
  let best = { score: 0, text: "" };
  for (const row of rows) {
    // A thread Claude skipped is marked analysed with no claims, so it can't loop forever.
    const claims = byThread.get(row.threadId)?.claims ?? [];
    const score = threadScore(claims);
    claimCount += claims.length;
    if (score > best.score) best = { score, text: claims[0]?.claim ?? row.title };
    await db.update(scoutThreads).set({ claims, score, status: "analyzed" }).where(eq(scoutThreads.id, row.id));
  }
  if (best.score >= STRONG_SCORE) {
    await notifyUser(userId, { title: `💡 Scout: ${best.score}/100 idea`, body: best.text.slice(0, 120), url: "/scout", tag: "scout" }).catch(() => {});
  }
  return `${rows.length} thread${rows.length === 1 ? "" : "s"} read · ${claimCount} claim${claimCount === 1 ? "" : "s"} · best ${best.score}/100`;
}

// ─── For the page ─────────────────────────────────────────────────────────────

export async function scoutOverviewFor(userId: number) {
  const [threads, settings] = await Promise.all([
    db.select().from(scoutThreads).where(eq(scoutThreads.userId, userId)).orderBy(desc(scoutThreads.score), desc(scoutThreads.id)).limit(150),
    scoutSettingsFor(userId),
  ]);
  const pending = threads.filter((t) => t.status !== "analyzed").length;
  return { threads, settings, pending };
}

export async function setScoutMarkFor(userId: number, id: number, mark: "new" | "saved" | "hidden") {
  await db.update(scoutThreads).set({ mark }).where(and(eq(scoutThreads.id, id), eq(scoutThreads.userId, userId)));
}
