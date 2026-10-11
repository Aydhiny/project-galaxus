// Gig radar: collect → match profiles → store with a free keyword score and a
// template reply → notify strong matches → Claude re-scores and writes real
// replies on the subscription runner (no tools; posts are untrusted).
//
// Politeness: Reddit is read with ONE request for all subreddits (official
// API when a free script-app key is set, else its public feed, which Reddit
// rate-limits hard). Job boards are read at most every 6 hours.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { gigProfiles, gigs, taskRuns, userSettings, voiceCommands, type GigProfile } from "@/lib/db/schema";
import {
  DEFAULT_PROFILES, detectBudget, gigVerdict, isHiringPost, keywordScore, matchKeywords, parseHnComments, parseRedditListing,
  parseRedditRss, parseRemoteOk, parseRemotive, parseWwrRss, splitList, templateReply, type GigSource, type RawGig,
} from "@/lib/gigs";
import { getSecret, setSecret } from "@/lib/services/secrets";
import { extractContactEmail } from "@/lib/autopilot";
import { notifyUser } from "@/lib/services/outreach/push";

const UA = "web:galaxus-gig-radar:1.0 (personal gig finder)";
const BOARD_INTERVAL_MS = 6 * 3_600_000;
const MAX_AGE_DAYS: Record<GigSource, number> = { reddit: 3, remotive: 10, remoteok: 10, wwr: 10, hn: 35 };

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function profilesFor(userId: number): Promise<GigProfile[]> {
  let rows = await db.select().from(gigProfiles).where(eq(gigProfiles.userId, userId)).orderBy(gigProfiles.id);
  if (rows.length === 0) {
    await db.insert(gigProfiles).values(DEFAULT_PROFILES.map((p) => ({ ...p, sources: [...p.sources], userId })));
    rows = await db.select().from(gigProfiles).where(eq(gigProfiles.userId, userId)).orderBy(gigProfiles.id);
  }
  return rows;
}

export type ProfilePatch = Partial<Pick<GigProfile, "name" | "keywords" | "exclude" | "subreddits" | "pitch" | "active">> & { sources?: string[] };

export async function saveProfileFor(userId: number, id: number | null, patch: ProfilePatch) {
  const clean = {
    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) || "Profile" } : {}),
    ...(patch.keywords !== undefined ? { keywords: patch.keywords.slice(0, 2000) } : {}),
    ...(patch.exclude !== undefined ? { exclude: (patch.exclude ?? "").slice(0, 2000) } : {}),
    ...(patch.subreddits !== undefined ? { subreddits: (patch.subreddits ?? "").replace(/r\//g, "").slice(0, 1000) } : {}),
    ...(patch.pitch !== undefined ? { pitch: (patch.pitch ?? "").slice(0, 2000) } : {}),
    ...(patch.active !== undefined ? { active: !!patch.active } : {}),
    ...(patch.sources !== undefined ? { sources: patch.sources.filter((s) => ["reddit", "remotive", "remoteok", "wwr", "hn"].includes(s)) } : {}),
  };
  if (id === null) {
    if (!clean.keywords) throw new Error("Add at least one keyword.");
    const [row] = await db.insert(gigProfiles).values({ userId, name: clean.name ?? "New profile", keywords: clean.keywords, ...clean }).returning();
    return row;
  }
  const [row] = await db.update(gigProfiles).set(clean).where(and(eq(gigProfiles.id, id), eq(gigProfiles.userId, userId))).returning();
  if (!row) throw new Error("Profile not found.");
  return row;
}

export async function deleteProfileFor(userId: number, id: number) {
  await db.delete(gigProfiles).where(and(eq(gigProfiles.id, id), eq(gigProfiles.userId, userId)));
}

// ─── Reddit key ───────────────────────────────────────────────────────────────

type RedditCreds = { clientId: string; clientSecret: string };

async function redditToken(creds: RedditCreds): Promise<string> {
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Reddit rejected the app key${json.error ? ` (${json.error})` : ""} — check the client ID and secret.`);
  return json.access_token;
}

export async function saveRedditKeyFor(userId: number, input: { clientId: string; clientSecret: string } | null) {
  if (!input || (!input.clientId.trim() && !input.clientSecret.trim())) {
    await setSecret(userId, "reddit", null);
    return;
  }
  const creds = { clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim() };
  await redditToken(creds); // prove it works before saving
  await setSecret(userId, "reddit", JSON.stringify(creds));
}

async function redditCreds(userId: number): Promise<RedditCreds | null> {
  const raw = await getSecret(userId, "reddit");
  try {
    return raw ? (JSON.parse(raw) as RedditCreds) : null;
  } catch {
    return null;
  }
}

// ─── Collectors ───────────────────────────────────────────────────────────────

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function getText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchReddit(userId: number, subs: string[]): Promise<RawGig[]> {
  if (subs.length === 0) return [];
  const path = subs.slice(0, 30).join("+");
  const creds = await redditCreds(userId);
  if (creds) {
    const token = await redditToken(creds);
    return parseRedditListing(await getJson(`https://oauth.reddit.com/r/${path}/new?limit=100&raw_json=1`, { Authorization: `Bearer ${token}` }));
  }
  return parseRedditRss(await getText(`https://www.reddit.com/r/${path}/new/.rss?limit=100`));
}

async function fetchHn(): Promise<RawGig[]> {
  const stories = (await getJson("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5")) as { hits?: { objectID: string; title: string }[] };
  const thread = stories.hits?.find((h) => /who is hiring/i.test(h.title));
  if (!thread) return [];
  return parseHnComments(await getJson(`https://hn.algolia.com/api/v1/search?tags=comment,story_${thread.objectID}&query=remote&hitsPerPage=200`));
}

async function boardDue(userId: number, source: string) {
  const [r] = await db.select().from(taskRuns).where(and(eq(taskRuns.userId, userId), eq(taskRuns.task, `gigsrc:${source}`))).limit(1);
  return !r || Date.now() - r.lastRunAt.getTime() > BOARD_INTERVAL_MS;
}
async function markBoard(userId: number, source: string, result: string) {
  await db.insert(taskRuns).values({ userId, task: `gigsrc:${source}`, lastRunAt: new Date(), lastResult: result })
    .onConflictDoUpdate({ target: [taskRuns.userId, taskRuns.task], set: { lastRunAt: new Date(), lastResult: result } });
}

/** One scan across every active profile. Returns what happened, for the UI and logs. */
export async function scanGigsFor(userId: number, opts: { forceBoards?: boolean } = {}) {
  const profiles = (await profilesFor(userId)).filter((p) => p.active);
  const wanted = new Set(profiles.flatMap((p) => p.sources));
  const subs = [...new Set(profiles.filter((p) => p.sources.includes("reddit")).flatMap((p) => splitList(p.subreddits)))];
  const raw: RawGig[] = [];
  const errors: string[] = [];

  const run = async (source: GigSource, fn: () => Promise<RawGig[]>, everyScan = false) => {
    if (!wanted.has(source)) return;
    if (!everyScan && !opts.forceBoards && !(await boardDue(userId, source))) return;
    try {
      const got = await fn();
      raw.push(...got);
      if (!everyScan) await markBoard(userId, source, `ok ${got.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${source}: ${msg}`);
      if (!everyScan) await markBoard(userId, source, `error ${msg}`.slice(0, 200));
    }
  };

  // Reddit every scan (posts get answered within hours); boards every 6 h.
  await Promise.all([
    run("reddit", () => fetchReddit(userId, subs), true),
    run("remotive", async () => {
      const terms = [...new Set(profiles.filter((p) => p.sources.includes("remotive")).map((p) => splitList(p.keywords)[0]).filter(Boolean))].slice(0, 3);
      const lists = await Promise.all(terms.map(async (t) => parseRemotive(await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(t)}&limit=50`))));
      return lists.flat();
    }),
    run("remoteok", async () => parseRemoteOk(await getJson("https://remoteok.com/api"))),
    run("wwr", async () => parseWwrRss(await getText("https://weworkremotely.com/remote-jobs.rss"))),
    run("hn", fetchHn),
  ]);

  // Match each post to the first profile it fits.
  const now = new Date();
  const rows = [];
  for (const g of raw) {
    if (g.postedAt && now.getTime() - g.postedAt.getTime() > MAX_AGE_DAYS[g.source] * 86_400_000) continue;
    if (!isHiringPost(g)) continue;
    const verdict = gigVerdict(g);
    if (!verdict.keep) continue; // not a paying client, or a salaried job
    for (const p of profiles) {
      if (!p.sources.includes(g.source)) continue;
      if (g.source === "reddit" && g.subreddit && !splitList(p.subreddits).includes(g.subreddit.toLowerCase())) continue;
      const hits = matchKeywords(`${g.title} ${g.body}`, splitList(p.keywords), splitList(p.exclude));
      if (hits.length === 0) continue;
      rows.push({
        userId, profileId: p.id, source: g.source, externalId: g.externalId.slice(0, 200), title: g.title, url: g.url,
        body: g.body.slice(0, 3000), author: g.author?.slice(0, 120) ?? null, budget: detectBudget(`${g.title} ${g.body}`),
        postedAt: g.postedAt, score: Math.max(0, Math.min(100, keywordScore(g, hits, now) + verdict.boost)), scoredBy: "keywords",
        reason: [verdict.tags.length ? verdict.tags.join(" · ") : null, `Matches: ${hits.slice(0, 4).join(", ")}`].filter(Boolean).join(" — "),
        draft: templateReply(g, p.pitch ?? ""),
        contactEmail: extractContactEmail(`${g.title}\n${g.body}`),
        image: g.image ?? null,
      });
      break;
    }
  }
  const inserted = rows.length
    ? await db.insert(gigs).values(rows).onConflictDoNothing({ target: [gigs.userId, gigs.externalId] }).returning({ id: gigs.id, score: gigs.score, title: gigs.title, budget: gigs.budget })
    : [];

  if (inserted.length) {
    await notifyNewGigs(userId, inserted);
    await queueClaudeScoring(userId);
  }
  return { fetched: raw.length, matched: rows.length, added: inserted.length, errors, redditMode: (await redditCreds(userId)) ? "api" : "rss" };
}

async function notifyNewGigs(userId: number, fresh: { id: number; score: number | null; title: string; budget: string | null }[]) {
  const [prefs] = await db.select({ on: userSettings.notifyGigs }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const strong = fresh.filter((g) => (g.score ?? 0) >= 45).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (strong.length === 0 || prefs?.on === false) return;
  const top = strong[0];
  await notifyUser(userId, {
    title: `🎯 ${strong.length} new gig${strong.length === 1 ? "" : "s"} for you`,
    body: `${top.title.replace(/\[[^\]]*\]\s*/g, "").slice(0, 90)}${top.budget ? ` · ${top.budget}` : ""}`,
    url: "/gigs",
    tag: "gigs",
  }).catch(() => {});
  await db.update(gigs).set({ notifiedAt: new Date() }).where(inArray(gigs.id, strong.map((g) => g.id)));
}

/** Claude re-scores + writes replies for gigs only keyword-scored so far (one job in flight at a time). */
export async function queueClaudeScoring(userId: number) {
  const { claudeHealthy } = await import("@/lib/services/claude-jobs");
  if (!(await claudeHealthy(userId))) return null; // keyword scores + built-in writer cover it
  const inFlight = await db.select({ id: voiceCommands.id }).from(voiceCommands)
    .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.kind, "gigs"), inArray(voiceCommands.status, ["queued", "running"]))).limit(1);
  if (inFlight.length) return null;
  const todo = await db.select({ id: gigs.id }).from(gigs)
    .where(and(eq(gigs.userId, userId), eq(gigs.scoredBy, "keywords"), eq(gigs.status, "new")))
    .orderBy(desc(gigs.score)).limit(15);
  if (todo.length === 0) return null;
  const { enqueueJobFor } = await import("@/lib/services/claude-jobs");
  return enqueueJobFor(userId, "gigs", `Score ${todo.length} gig${todo.length === 1 ? "" : "s"}`, { gigIds: todo.map((t) => t.id) });
}

// ─── Reading / updating ───────────────────────────────────────────────────────

export async function radarFor(userId: number) {
  const [profiles, list, creds, prefs, lastScan] = await Promise.all([
    profilesFor(userId),
    db.select().from(gigs).where(and(eq(gigs.userId, userId), inArray(gigs.status, ["new", "saved", "applied"])))
      .orderBy(desc(gigs.score), desc(gigs.postedAt)).limit(200),
    redditCreds(userId),
    db.select({ on: userSettings.notifyGigs }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({ at: taskRuns.lastRunAt, result: taskRuns.lastResult }).from(taskRuns).where(and(eq(taskRuns.userId, userId), eq(taskRuns.task, "gigs"))).limit(1),
  ]);
  return { profiles, gigs: list, redditConnected: !!creds, notify: prefs[0]?.on ?? true, lastScan: lastScan[0] ?? null };
}

export async function updateGigFor(userId: number, id: number, patch: { status?: string; draft?: string }) {
  const set: { status?: string; draft?: string } = {};
  if (patch.status !== undefined) {
    if (!["new", "saved", "applied", "dismissed"].includes(patch.status)) throw new Error("Unknown status.");
    set.status = patch.status;
  }
  if (patch.draft !== undefined) set.draft = String(patch.draft).slice(0, 2000);
  await db.update(gigs).set(set).where(and(eq(gigs.id, id), eq(gigs.userId, userId)));
}

export async function setGigNotificationsFor(userId: number, on: boolean) {
  await db.insert(userSettings).values({ userId, notifyGigs: on })
    .onConflictDoUpdate({ target: userSettings.userId, set: { notifyGigs: on, updatedAt: new Date() } });
}

/** Old, untouched gigs fall off after two weeks. */
export async function pruneGigsFor(userId: number) {
  await db.update(gigs).set({ status: "dismissed" })
    .where(and(eq(gigs.userId, userId), eq(gigs.status, "new"), sql`${gigs.createdAt} < now() - interval '14 days'`));
  // Re-check what's waiting against the current quality rules (they get stricter over time).
  const waiting = await db.select({ id: gigs.id, title: gigs.title, body: gigs.body, source: gigs.source }).from(gigs)
    .where(and(eq(gigs.userId, userId), eq(gigs.status, "new")));
  const drop = waiting.filter((g) => !gigVerdict({ title: g.title, body: g.body ?? "", source: g.source as GigSource }).keep).map((g) => g.id);
  if (drop.length) await db.update(gigs).set({ status: "dismissed" }).where(inArray(gigs.id, drop));
  return drop.length;
}

