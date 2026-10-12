// Reddit for the game: find the right communities, read their rules, and have
// Claude draft ONE honest post a day. A human opens Reddit and presses Post —
// nothing here submits, comments or votes (Reddit bans that, and so would we).
//
// Reddit access reuses the free "script app" key saved in Gig radar
// (user_secrets "reddit"), read here directly so this section doesn't depend
// on the gig code. Without a key we try Reddit's public JSON, which Reddit
// often refuses to cloud servers — the UI says so instead of failing quietly.

import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSettings, redditCommunities, redditPosts, redditSettings } from "@/lib/db/schema";
import { getSecret, setSecret } from "@/lib/services/secrets";
import { enqueueJobFor } from "@/lib/services/claude-jobs";
import { localNow } from "@/lib/outreach";
import {
  DEFAULT_KEYWORDS, SEED_COMMUNITIES, SKIP_COOLDOWN_DAYS, POST_COOLDOWN_DAYS, classifyPromo, firstCommentWithLink, normalizeRedditUsername,
  normalizeSubreddit, parseAbout, parseHot, parseRedditPost, parseRules, parseSearch, pickCommunity, redditPostPrompt, type PromoPolicy,
} from "@/lib/reddit";

// Reddit's API rules ask for a descriptive User-Agent that names you; generic ones get throttled first.
const userAgent = (username: string | null) =>
  `web:galaxus-game-community:1.0 (personal game-dev assistant${username ? `; by /u/${username}` : ""})`;
const STALE_MS = 20 * 3_600_000;
const QUEUED_TIMEOUT_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

const DEFAULT_TAGLINE = "my indie game";
// Facts Claude is allowed to use. Edited in the UI — check these are true before the first post.
const DEFAULT_ABOUT = `- (Replace these with true facts about your game: genre, engine, team size.)
- (What makes it different — a feature, the art, the music.)
- (Any milestone: a demo, an award, a release date.)`;

// ─── Reddit client ────────────────────────────────────────────────────────────

class RedditHttpError extends Error {
  constructor(readonly status: number) {
    super(`Reddit answered ${status}`);
  }
}

type Creds = { clientId: string; clientSecret: string };

async function credsFor(userId: number): Promise<Creds | null> {
  const raw = await getSecret(userId, "reddit");
  try {
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}

async function appToken(c: Creds, ua: string): Promise<string> {
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": ua,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error("Reddit rejected the app key — check the client ID and secret in Connections → Reddit.");
  return json.access_token;
}

async function redditClient(userId: number) {
  const [creds, settings] = await Promise.all([credsFor(userId), settingsFor(userId)]);
  const ua = userAgent(settings.redditUsername);
  let token: string | null = null;
  return {
    connected: !!creds,
    async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
      const qs = new URLSearchParams({ ...query, raw_json: "1" });
      const headers: Record<string, string> = { "User-Agent": ua, Accept: "application/json" };
      let url: string;
      if (creds) {
        token ??= await appToken(creds, ua);
        headers.Authorization = `Bearer ${token}`;
        url = `https://oauth.reddit.com${path}?${qs}`;
      } else {
        url = `https://www.reddit.com${path}.json?${qs}`;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!res.ok) throw new RedditHttpError(res.status);
      return res.json();
    },
  };
}

const BLOCKED = "Reddit refused the request. Save a free Reddit app key in Connections → Reddit and try again.";

// ─── The Reddit connection (Connections tab) ──────────────────────────────────
// One key serves both Gig radar and this section: both read user_secrets "reddit".

export async function redditConnectionFor(userId: number) {
  const [creds, settings] = await Promise.all([credsFor(userId), settingsFor(userId)]);
  return { connected: !!creds, username: settings.redditUsername };
}

const KEY_PART = /^[\w-]{6,100}$/;

/**
 * Save (or, with null, remove) the Reddit script-app key. The key is proven
 * against Reddit before it's stored, so a typo fails now, not at 6 a.m.
 * Leaving both key fields empty only updates the username.
 */
export async function saveRedditConnectionFor(userId: number, input: { clientId: string; clientSecret: string; username?: string } | null) {
  if (input === null) {
    await setSecret(userId, "reddit", null);
    return;
  }
  const existing = await settingsFor(userId);
  let username: string | null | undefined; // undefined = leave as is, null = clear
  if (input.username !== undefined) {
    const raw = input.username.trim();
    username = raw ? normalizeRedditUsername(raw) : null;
    if (raw && !username) throw new Error('Your Reddit username looks like "Aydhiny" (3–20 letters, numbers, _ or -).');
  }
  const id = input.clientId.trim();
  const secret = input.clientSecret.trim();
  if (id || secret) {
    if (!KEY_PART.test(id) || !KEY_PART.test(secret)) {
      throw new Error("Paste both values from reddit.com/prefs/apps: the short ID under your app's name, and the longer \"secret\".");
    }
    const effective = username === undefined ? existing.redditUsername : username;
    await appToken({ clientId: id, clientSecret: secret }, userAgent(effective)); // throws a readable error if Reddit says no
    await setSecret(userId, "reddit", JSON.stringify({ clientId: id, clientSecret: secret }));
  }
  if (username !== undefined) {
    await db.update(redditSettings).set({ redditUsername: username, updatedAt: new Date() }).where(eq(redditSettings.userId, userId));
  }
}

/** A real request, so a 403 is explained now rather than discovered by a failed daily run. */
export async function testRedditFor(userId: number): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await redditClient(userId);
    const about = parseAbout(await client.get("/r/IndieDev/about"));
    if (!about) return { ok: false, message: "Reddit answered, but not with a community page we could read." };
    return {
      ok: true,
      message: client.connected
        ? `Working — signed in with your app key and reached r/IndieDev (${about.subscribers.toLocaleString("en")} members).`
        : `Reached r/IndieDev without a key (${about.subscribers.toLocaleString("en")} members). Reddit often blocks that from servers, so a key is safer.`,
    };
  } catch (e) {
    if (e instanceof RedditHttpError) {
      return { ok: false, message: e.status === 403 || e.status === 401 ? BLOCKED : e.status === 429 ? "Reddit asked us to slow down — try again in a minute." : `Reddit answered ${e.status}.` };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't reach Reddit." };
  }
}

// ─── Settings + seeding ───────────────────────────────────────────────────────

async function todayFor(userId: number) {
  const [row] = await db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  return localNow(row?.tz ?? "Europe/Sarajevo");
}

async function settingsFor(userId: number) {
  await db.insert(redditSettings).values({ userId, tagline: DEFAULT_TAGLINE, about: DEFAULT_ABOUT, keywords: DEFAULT_KEYWORDS }).onConflictDoNothing();
  const [row] = await db.select().from(redditSettings).where(eq(redditSettings.userId, userId)).limit(1);
  return row;
}

async function seedIfEmpty(userId: number) {
  const [any] = await db.select({ id: redditCommunities.id }).from(redditCommunities).where(eq(redditCommunities.userId, userId)).limit(1);
  if (any) return;
  await db
    .insert(redditCommunities)
    .values(SEED_COMMUNITIES.map((name, i) => ({ userId, name, source: "seed", status: "active", priority: (i + 1) * 10 })))
    .onConflictDoNothing();
}

export type SettingsPatch = Partial<{
  enabled: boolean; dailyCap: number; gameName: string; tagline: string; about: string; wishlistUrl: string; keywords: string;
}>;

export async function saveSettingsFor(userId: number, patch: SettingsPatch) {
  await settingsFor(userId);
  const set: Partial<typeof redditSettings.$inferInsert> = { updatedAt: new Date() };
  if (patch.enabled !== undefined) set.enabled = !!patch.enabled;
  if (patch.dailyCap !== undefined) set.dailyCap = Math.min(2, Math.max(1, Math.round(Number(patch.dailyCap)) || 1));
  if (patch.gameName !== undefined) {
    const n = patch.gameName.trim().slice(0, 120);
    if (!n) throw new Error("Give the game a name.");
    set.gameName = n;
  }
  if (patch.tagline !== undefined) set.tagline = patch.tagline.trim().slice(0, 200) || null;
  if (patch.about !== undefined) set.about = patch.about.trim().slice(0, 3000) || null;
  if (patch.keywords !== undefined) set.keywords = patch.keywords.trim().slice(0, 300) || null;
  if (patch.wishlistUrl !== undefined) {
    const raw = patch.wishlistUrl.trim();
    if (raw) {
      let ok = false;
      try { ok = ["https:", "http:"].includes(new URL(raw).protocol); } catch { /* not a URL */ }
      if (!ok) throw new Error("The Steam link should start with https://");
    }
    set.wishlistUrl = raw ? raw.slice(0, 500) : null;
  }
  await db.update(redditSettings).set(set).where(eq(redditSettings.userId, userId));
}

// ─── State for the page ───────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = { active: 0, suggested: 1, muted: 2 };

export async function redditStateFor(userId: number) {
  await seedIfEmpty(userId);
  const [settings, communities, posts, client, today] = await Promise.all([
    settingsFor(userId),
    db.select().from(redditCommunities).where(eq(redditCommunities.userId, userId)),
    db.select().from(redditPosts).where(eq(redditPosts.userId, userId)).orderBy(desc(redditPosts.id)).limit(40),
    credsFor(userId),
    todayFor(userId),
  ]);
  communities.sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || a.priority - b.priority || a.id - b.id);
  const next = pickCommunity(communities, new Date());
  return {
    settings,
    communities,
    posts,
    today: today.day,
    redditConnected: !!client,
    next: next ? next.name : null,
    unread: communities.filter((c) => c.rules === null && c.status !== "muted").length,
  };
}

// ─── Communities: refresh + discover ──────────────────────────────────────────

/**
 * Read about + rules + hot threads for the communities that are due. Muted
 * communities are never fetched. A community that is private, banned,
 * adult or restricted gets muted with a note, so we never draft for it.
 */
export async function refreshCommunitiesFor(userId: number, opts: { max?: number } = {}) {
  await seedIfEmpty(userId);
  const client = await redditClient(userId);
  const rows = await db.select().from(redditCommunities)
    .where(and(eq(redditCommunities.userId, userId), inArray(redditCommunities.status, ["active", "suggested"])));
  const now = Date.now();
  const due = rows
    .filter((r) => !r.fetchedAt || now - r.fetchedAt.getTime() > STALE_MS)
    .sort((a, b) => (a.fetchedAt?.getTime() ?? 0) - (b.fetchedAt?.getTime() ?? 0))
    .slice(0, opts.max ?? 8);

  let refreshed = 0;
  let muted = 0;
  const errors: string[] = [];
  for (const c of due) {
    try {
      const about = parseAbout(await client.get(`/r/${c.name}/about`));
      if (!about || about.over18 || !about.open) {
        await db.update(redditCommunities).set({ status: "muted", promoNote: "Not open to new posts (private, restricted, adult or missing).", fetchedAt: new Date() })
          .where(eq(redditCommunities.id, c.id));
        muted++;
        continue;
      }
      const rules = parseRules(await client.get(`/r/${c.name}/about/rules`));
      const hot = parseHot(await client.get(`/r/${c.name}/hot`, { limit: "25" }));
      const promo = classifyPromo(rules);
      await db.update(redditCommunities).set({
        title: about.title, description: about.description, subscribers: about.subscribers,
        rules, hot, promoPolicy: promo.policy, promoNote: promo.note, fetchedAt: new Date(),
      }).where(eq(redditCommunities.id, c.id));
      refreshed++;
    } catch (e) {
      if (e instanceof RedditHttpError) {
        if (e.status === 404 || (e.status === 403 && client.connected)) {
          await db.update(redditCommunities).set({ status: "muted", promoNote: "Doesn't exist, or is private/banned.", fetchedAt: new Date() }).where(eq(redditCommunities.id, c.id));
          muted++;
          continue;
        }
        errors.push(e.status === 429 ? "Reddit asked us to slow down — the rest will refresh next time." : e.status === 403 ? BLOCKED : `r/${c.name}: ${e.message}`);
        if (e.status === 429 || e.status === 403) break; // the same answer is coming for every other one
        continue;
      }
      throw e; // our own readable errors (bad key) bubble up
    }
  }
  return { refreshed, muted, errors: [...new Set(errors)] };
}

const splitKeywords = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Find communities we don't know yet. They arrive as "suggested" — you approve each, nothing is auto-promoted to a posting target. */
export async function discoverCommunitiesFor(userId: number) {
  await seedIfEmpty(userId);
  const s = await settingsFor(userId);
  const client = await redditClient(userId);
  const known = await db.select({ name: redditCommunities.name, status: redditCommunities.status }).from(redditCommunities).where(eq(redditCommunities.userId, userId));
  const have = new Set(known.map((k) => k.name.toLowerCase()));
  if (known.filter((k) => k.status === "suggested").length >= 30) return { added: 0, errors: [] as string[] };

  let added = 0;
  const errors: string[] = [];
  for (const q of splitKeywords(s.keywords ?? DEFAULT_KEYWORDS).slice(0, 5)) {
    try {
      const found = parseSearch(await client.get("/subreddits/search", { q, limit: "15", include_over_18: "off", sort: "relevance" }));
      for (const f of found) {
        if (have.has(f.name.toLowerCase()) || added >= 12) continue;
        have.add(f.name.toLowerCase());
        await db.insert(redditCommunities).values({ userId, name: f.name.slice(0, 30), title: f.title, subscribers: f.subscribers, status: "suggested", source: "search", priority: 200 })
          .onConflictDoNothing();
        added++;
      }
    } catch (e) {
      if (e instanceof RedditHttpError) {
        errors.push(e.status === 403 ? BLOCKED : e.status === 429 ? "Reddit asked us to slow down — try again in a few minutes." : e.message);
        break;
      }
      throw e;
    }
  }
  return { added, errors: [...new Set(errors)] };
}

export async function addCommunityFor(userId: number, input: string) {
  const name = normalizeSubreddit(input);
  if (!name) throw new Error('Use a name like "IndieDev" or "r/IndieDev".');
  await seedIfEmpty(userId);
  const [row] = await db.insert(redditCommunities).values({ userId, name, source: "manual", status: "active", priority: 50 })
    .onConflictDoUpdate({ target: [redditCommunities.userId, redditCommunities.name], set: { status: "active" } })
    .returning();
  return row;
}

export async function setCommunityStatusFor(userId: number, id: number, status: string) {
  if (!["active", "muted"].includes(status)) throw new Error("Unknown status.");
  await db.update(redditCommunities).set({ status }).where(and(eq(redditCommunities.id, id), eq(redditCommunities.userId, userId)));
}

// ─── Daily post: queue → Claude → draft ───────────────────────────────────────

/**
 * Queue today's draft (respecting the daily cap). Called by the scheduler and
 * by the "Draft today's post" button. Never posts anything.
 */
export type QueueResult =
  | { queued: true; postId: number; subreddit: string; jobId: number; dispatched: boolean }
  | { queued: false; reason: string; needsRefresh?: boolean };

export async function queueDailyPostFor(userId: number, opts: { manual?: boolean } = {}): Promise<QueueResult> {
  const s = await settingsFor(userId);
  if (!opts.manual && !s.enabled) return { queued: false, reason: "Daily drafting is off." };
  const day = (await todayFor(userId)).day;

  // A job the runner never answered shouldn't block the day forever.
  await db.update(redditPosts).set({ status: "failed", note: "Claude never answered — try again." })
    .where(and(eq(redditPosts.userId, userId), eq(redditPosts.status, "queued"), lt(redditPosts.createdAt, new Date(Date.now() - QUEUED_TIMEOUT_MS))));

  const todays = await db.select().from(redditPosts).where(and(eq(redditPosts.userId, userId), eq(redditPosts.day, day)));
  if (todays.filter((p) => p.status !== "failed" && p.status !== "skipped").length >= s.dailyCap) {
    return { queued: false, reason: "Today's post is already drafted." };
  }
  if (todays.filter((p) => p.status === "skipped").length >= 3) {
    return { queued: false, reason: "Rules in three communities ruled out a post today — try again tomorrow." };
  }

  await seedIfEmpty(userId);
  const communities = await db.select().from(redditCommunities).where(eq(redditCommunities.userId, userId));
  const pick = pickCommunity(communities, new Date());
  if (!pick) {
    const unread = communities.some((c) => c.rules === null && c.status === "active");
    return {
      queued: false,
      needsRefresh: unread,
      reason: unread
        ? "Refresh communities first — their rules haven't been read yet."
        : `No community is ready: each is muted, bans promotion, or was used in the last ${POST_COOLDOWN_DAYS} days.`,
    };
  }

  const [post] = await db.insert(redditPosts).values({ userId, communityId: pick.id, subreddit: pick.name, day, status: "queued" }).returning({ id: redditPosts.id });
  try {
    const job = await enqueueJobFor(userId, "reddit_post", `Reddit post for r/${pick.name}`, { postId: post.id });
    return { queued: true, postId: post.id, subreddit: pick.name, jobId: job.id, dispatched: job.dispatched };
  } catch (e) {
    await db.update(redditPosts).set({ status: "failed", note: e instanceof Error ? e.message.slice(0, 300) : "Couldn't start Claude." }).where(eq(redditPosts.id, post.id));
    throw e;
  }
}

/**
 * The "Draft today's post" button and the MCP tool: like queueDailyPostFor, but
 * on a fresh install (no rules read yet) it reads them first and tries again.
 */
export async function draftTodayFor(userId: number): Promise<QueueResult> {
  let r = await queueDailyPostFor(userId, { manual: true });
  if (!r.queued && r.needsRefresh) {
    const read = await refreshCommunitiesFor(userId, { max: 10 });
    if (read.refreshed === 0 && read.errors.length) throw new Error(read.errors[0]);
    r = await queueDailyPostFor(userId, { manual: true });
  }
  return r;
}

/** Ask Claude to write a different post for the same community. */
export async function redraftFor(userId: number, postId: number) {
  const [post] = await db.select().from(redditPosts).where(and(eq(redditPosts.id, postId), eq(redditPosts.userId, userId))).limit(1);
  if (!post) throw new Error("Post not found.");
  if (post.status === "posted") throw new Error("That one is already posted.");
  await db.update(redditPosts).set({ status: "queued", note: null, createdAt: new Date() }).where(eq(redditPosts.id, postId));
  const job = await enqueueJobFor(userId, "reddit_post", `New draft for r/${post.subreddit}`, { postId });
  return { postId, subreddit: post.subreddit, jobId: job.id, dispatched: job.dispatched };
}

/** The prompt, built at claim time from fresh rules (called by lib/services/claude-jobs.ts). */
export async function buildRedditPostPrompt(userId: number, postId: number) {
  const [post] = await db.select().from(redditPosts).where(and(eq(redditPosts.id, postId), eq(redditPosts.userId, userId))).limit(1);
  if (!post) throw new Error("Post not found.");
  const [c] = post.communityId
    ? await db.select().from(redditCommunities).where(and(eq(redditCommunities.id, post.communityId), eq(redditCommunities.userId, userId))).limit(1)
    : [];
  if (!c || c.rules === null) throw new Error("That community's rules haven't been read yet.");
  const s = await settingsFor(userId);
  const previous = (await db.select().from(redditPosts).where(and(eq(redditPosts.userId, userId), inArray(redditPosts.status, ["draft", "posted", "queued", "skipped"]))).orderBy(desc(redditPosts.id)).limit(12))
    .filter((p) => p.title)
    .map((p) => ({ subreddit: p.subreddit, title: p.title as string, angle: p.angle }));
  return redditPostPrompt({
    game: s.gameName,
    tagline: s.tagline ?? "",
    about: s.about ?? "",
    hasWishlistLink: !!s.wishlistUrl,
    community: {
      name: c.name, title: c.title ?? "", description: c.description ?? "", subscribers: c.subscribers,
      policy: c.promoPolicy as PromoPolicy, rules: c.rules, hot: c.hot ?? [],
    },
    previous,
  });
}

/** Store Claude's answer (called by lib/services/claude-jobs.ts). Returns the notification line. */
export async function applyRedditPostResult(userId: number, postId: number, text: string): Promise<string> {
  const [post] = await db.select().from(redditPosts).where(and(eq(redditPosts.id, postId), eq(redditPosts.userId, userId))).limit(1);
  if (!post) throw new Error("Post not found.");
  if (post.status === "posted") return "Already posted — left as it is.";

  const parsed = parseRedditPost(text);
  if (parsed.kind === "invalid") {
    await db.update(redditPosts).set({ status: "failed", note: parsed.why }).where(eq(redditPosts.id, postId));
    throw new Error(parsed.why);
  }

  if (parsed.kind === "skip") {
    await db.update(redditPosts).set({ status: "skipped", note: parsed.reason }).where(eq(redditPosts.id, postId));
    if (post.communityId) {
      await db.update(redditCommunities)
        .set({ skipUntil: new Date(Date.now() + SKIP_COOLDOWN_DAYS * DAY_MS), promoNote: parsed.reason })
        .where(and(eq(redditCommunities.id, post.communityId), eq(redditCommunities.userId, userId)));
    }
    // Today shouldn't be wasted: try the next community (capped at 3 skips a day inside queueDailyPostFor).
    const next = await queueDailyPostFor(userId).catch(() => null);
    return `r/${post.subreddit} skipped (${parsed.reason})${next?.queued ? ` — trying r/${next.subreddit}` : ""}`;
  }

  const s = await settingsFor(userId);
  const d = parsed.draft;
  const warnings = [...d.warnings];
  let firstComment = firstCommentWithLink(d.firstComment, s.wishlistUrl);
  if (d.firstComment && !s.wishlistUrl) {
    firstComment = null;
    warnings.push("Add your Steam page in the settings and the draft gets a first comment offering it.");
  }
  if (!d.linkAllowed) warnings.push("This community's rules don't clearly allow links — keep the Steam link in your profile instead.");

  await db.update(redditPosts).set({
    title: d.title, body: d.body, firstComment, mediaHint: d.mediaHint, flairHint: d.flairHint, angle: d.angle,
    warnings, status: "draft", note: null,
  }).where(eq(redditPosts.id, postId));
  return `Reddit draft ready for r/${post.subreddit}`;
}

// ─── Working with a draft ─────────────────────────────────────────────────────

export async function updatePostFor(userId: number, id: number, patch: { title?: string; body?: string; firstComment?: string }) {
  const set: Partial<typeof redditPosts.$inferInsert> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim().slice(0, 300);
    if (!t) throw new Error("A post needs a title.");
    set.title = t;
  }
  if (patch.body !== undefined) set.body = patch.body.slice(0, 6000);
  if (patch.firstComment !== undefined) set.firstComment = patch.firstComment.trim().slice(0, 1000) || null;
  const rows = await db.update(redditPosts).set(set).where(and(eq(redditPosts.id, id), eq(redditPosts.userId, userId), eq(redditPosts.status, "draft"))).returning({ id: redditPosts.id });
  if (rows.length === 0) throw new Error("Only an open draft can be edited.");
}

export async function markPostedFor(userId: number, id: number, url?: string) {
  let postUrl: string | null = null;
  if (url?.trim()) {
    try {
      const u = new URL(url.trim());
      if (!/(^|\.)reddit\.com$/.test(u.hostname) && u.hostname !== "redd.it") throw new Error("not reddit");
      postUrl = u.toString().slice(0, 500);
    } catch {
      throw new Error("That doesn't look like a Reddit link — paste the post's address, or leave it empty.");
    }
  }
  const [row] = await db.update(redditPosts).set({ status: "posted", postedAt: new Date(), postUrl })
    .where(and(eq(redditPosts.id, id), eq(redditPosts.userId, userId), inArray(redditPosts.status, ["draft", "queued", "failed"]))).returning();
  if (!row) throw new Error("Post not found.");
  if (row.communityId) {
    await db.update(redditCommunities).set({ lastPostedAt: new Date() }).where(and(eq(redditCommunities.id, row.communityId), eq(redditCommunities.userId, userId)));
  }
}

export async function skipPostFor(userId: number, id: number) {
  const [row] = await db.update(redditPosts).set({ status: "skipped", note: "Skipped by you." })
    .where(and(eq(redditPosts.id, id), eq(redditPosts.userId, userId), inArray(redditPosts.status, ["draft", "queued", "failed"]))).returning();
  if (!row) throw new Error("Post not found.");
  // Don't offer the same community again tomorrow.
  if (row.communityId) {
    await db.update(redditCommunities).set({ skipUntil: new Date(Date.now() + POST_COOLDOWN_DAYS * DAY_MS) })
      .where(and(eq(redditCommunities.id, row.communityId), eq(redditCommunities.userId, userId)));
  }
}

// ─── Scheduler entry ──────────────────────────────────────────────────────────

/** Once a day: read rules for what's stale, look for new communities on Mondays, then queue today's draft. */
export async function runRedditDailyFor(userId: number) {
  const s = await settingsFor(userId);
  if (!s.enabled) return { skipped: "off" };
  const refreshed = await refreshCommunitiesFor(userId, { max: 8 }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const discovered = (await todayFor(userId)).weekday === 1 ? await discoverCommunitiesFor(userId).catch(() => null) : null;
  const queued = await queueDailyPostFor(userId);
  return { refreshed, discovered, queued: queued.queued ? `r/${queued.subreddit}` : queued.reason };
}
