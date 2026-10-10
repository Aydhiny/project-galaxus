// The outreach pipeline, per user:
//
//   discover (Google Places) → audit (homepage) → draft (Claude/template)
//     → release in random batches on workdays → push notification
//     → YOU tap "Send on WhatsApp" (wa.me click-to-chat, prefilled) → track replies
//
// Deliberately NOT automated: the actual sending. Automated WhatsApp messages
// from a personal number break WhatsApp's terms and get numbers banned fast;
// a human pressing send on a personal, relevant message is what keeps this
// both effective and allowed.
//
// tickFor() is called every ~15 min on workdays by GitHub Actions
// (.github/workflows/outreach-tick.yml → /api/cron/outreach). Every step is
// bounded and idempotent, so a missed or doubled tick is harmless.

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, leadSearches, outreachDays, outreachSettings, users, type Lead, type OutreachSlot } from "@/lib/db/schema";
import { getSecret, setSecret } from "@/lib/services/secrets";
import {
  batchSizes, isLeadStatus, isMobileBA, localNow, normalizePhone, osmType, outreachStats, parsePastedLeads, planSlots,
  REPLIED_STATUSES, scoreLead, type LeadStatus,
} from "@/lib/outreach";
import { searchPlaces, type Place } from "./places";
import { searchOsm } from "./osm";
import { auditWebsite } from "./audit";
import { draftMessage, monthlyReview } from "./messages";
import { notifyUser } from "./push";

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getConfigFor(userId: number) {
  const find = () => db.select().from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  let [settings] = await find();
  if (!settings) {
    await db.insert(outreachSettings).values({ userId }).onConflictDoNothing();
    [settings] = await find();
  }
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return {
    settings,
    senderName: settings.senderName?.trim() || user?.name?.split(" ")[0] || "Ajdin",
    googleKey: await getSecret(userId, "google"),
    anthropicKey: await getSecret(userId, "anthropic"),
  };
}

/** What the browser may see: no key material, just whether keys are set. */
export async function getPublicConfigFor(userId: number) {
  const { settings, senderName, googleKey, anthropicKey } = await getConfigFor(userId);
  return {
    active: settings.active,
    senderName,
    offer: settings.offer ?? "",
    dailyVolume: settings.dailyVolume,
    batches: settings.batches,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    timezone: settings.timezone,
    hasGoogleKey: !!googleKey,
    hasAnthropicKey: !!anthropicKey,
    lastReview: settings.lastReview,
    lastReviewAt: settings.lastReviewAt,
    placesCalls: settings.placesMonth === localNow(settings.timezone).day.slice(0, 7) ? settings.placesCalls : 0,
    placesCap: settings.placesMonthlyCap,
  };
}
export type PublicOutreachConfig = Awaited<ReturnType<typeof getPublicConfigFor>>;

export type SettingsPatch = Partial<{
  active: boolean;
  senderName: string;
  offer: string;
  dailyVolume: number;
  batches: number;
  windowStart: number;
  windowEnd: number;
  googleKey: string; // "" clears
  anthropicKey: string; // "" clears
}>;

const clampInt = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v))));

export async function saveSettingsFor(userId: number, patch: SettingsPatch) {
  await getConfigFor(userId); // ensures the row exists
  const set: Partial<typeof outreachSettings.$inferInsert> = { updatedAt: new Date() };
  if (patch.active !== undefined) set.active = !!patch.active;
  if (patch.senderName !== undefined) set.senderName = String(patch.senderName).trim().slice(0, 100) || null;
  if (patch.offer !== undefined) set.offer = String(patch.offer).trim().slice(0, 1000) || null;
  if (patch.dailyVolume !== undefined) set.dailyVolume = clampInt(patch.dailyVolume, 1, 40);
  if (patch.batches !== undefined) set.batches = clampInt(patch.batches, 1, 6);
  if (patch.windowStart !== undefined) set.windowStart = clampInt(patch.windowStart, 0, 23);
  if (patch.windowEnd !== undefined) set.windowEnd = clampInt(patch.windowEnd, 1, 24);
  if (patch.googleKey !== undefined) await setSecret(userId, "google", patch.googleKey);
  if (patch.anthropicKey !== undefined) await setSecret(userId, "anthropic", patch.anthropicKey);
  await db.update(outreachSettings).set(set).where(eq(outreachSettings.userId, userId));

  const { settings } = await getConfigFor(userId);
  if (settings.windowEnd <= settings.windowStart) {
    await db.update(outreachSettings).set({ windowEnd: Math.min(24, settings.windowStart + 1) }).where(eq(outreachSettings.userId, userId));
  }
  if (patch.active) await ensureDefaultSearchesFor(userId);
}

// ─── Searches ─────────────────────────────────────────────────────────────────

/** First campaign: dentists in Sarajevo, phrased the ways people search. */
const DEFAULT_SEARCHES = [
  { source: "osm", query: "dentist", city: "Sarajevo", category: "Dentist" }, // free, runs without any key
  { source: "google", query: "stomatološka ordinacija", city: "Sarajevo", category: "Dentist" },
  { source: "google", query: "zubar", city: "Sarajevo", category: "Dentist" },
  { source: "google", query: "dental clinic", city: "Sarajevo", category: "Dentist" },
];

export async function ensureDefaultSearchesFor(userId: number) {
  const existing = await db.select({ id: leadSearches.id }).from(leadSearches).where(eq(leadSearches.userId, userId)).limit(1);
  if (existing.length === 0) await db.insert(leadSearches).values(DEFAULT_SEARCHES.map((s) => ({ ...s, userId })));
}

export async function listSearchesFor(userId: number) {
  return db.select().from(leadSearches).where(eq(leadSearches.userId, userId)).orderBy(leadSearches.createdAt);
}

export async function addSearchFor(userId: number, input: { query: string; city: string; category?: string; source?: string }) {
  const source = input.source === "osm" ? "osm" : "google";
  const query = String(input.query ?? "").trim().slice(0, 200);
  const city = String(input.city ?? "").trim().slice(0, 100);
  if (!query || !city) throw new Error("Search and city are required.");
  if (source === "osm" && !osmType(query)) throw new Error("Pick a business type for OpenStreetMap.");
  const category = String(input.category ?? "").trim().slice(0, 60) || (source === "osm" ? osmType(query)!.label : null);
  const [row] = await db.insert(leadSearches).values({ userId, source, query, city, category }).returning();
  return row;
}

export async function updateSearchFor(userId: number, id: number, patch: { active?: boolean; restart?: boolean }) {
  const set: Partial<typeof leadSearches.$inferInsert> = {};
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.restart) Object.assign(set, { pagesFetched: 0, nextPageToken: null });
  await db.update(leadSearches).set(set).where(and(eq(leadSearches.id, id), eq(leadSearches.userId, userId)));
}

export async function deleteSearchFor(userId: number, id: number) {
  await db.delete(leadSearches).where(and(eq(leadSearches.id, id), eq(leadSearches.userId, userId)));
}

// ─── Pipeline steps ───────────────────────────────────────────────────────────

const FREE_TIER_HINT = "Google's free allowance is 1,000 requests a month; Galaxus stops below your cap so you're never billed.";

/** Count a Places request against this month's cap, or refuse if it would pass it. */
async function takePlacesCall(userId: number) {
  const { settings } = await getConfigFor(userId);
  const month = localNow(settings.timezone).day.slice(0, 7);
  const used = settings.placesMonth === month ? settings.placesCalls : 0;
  if (used >= settings.placesMonthlyCap) {
    throw new Error(`Google Places paused: ${used}/${settings.placesMonthlyCap} requests used this month. ${FREE_TIER_HINT}`);
  }
  await db.update(outreachSettings).set({ placesMonth: month, placesCalls: used + 1 }).where(eq(outreachSettings.userId, userId));
}

/** Fetch one page from the next search that still has results. */
async function discoverPage(userId: number, googleKey: string | null): Promise<number | null> {
  const searches = await db
    .select()
    .from(leadSearches)
    .where(and(eq(leadSearches.userId, userId), eq(leadSearches.active, true)))
    .orderBy(sql`${leadSearches.lastRunAt} asc nulls first`);
  // Without a Google key, only the free OpenStreetMap searches can run.
  const search = searches.find((s) => (s.source === "osm" || googleKey) && (s.pagesFetched === 0 || s.nextPageToken));
  if (!search) return null; // every usable search exhausted — add a new city/category

  let places: Place[];
  let nextPageToken: string | null = null;
  if (search.source === "osm") {
    try {
      places = await searchOsm(search.query, search.city); // all results at once, no pages
    } catch (e) {
      // OSM's free servers are sometimes overloaded: move this search to the
      // back of the queue so other searches get a turn, and retry later.
      await db.update(leadSearches).set({ lastRunAt: new Date() }).where(eq(leadSearches.id, search.id));
      throw e;
    }
  } else {
    await takePlacesCall(userId);
    try {
      const result = await searchPlaces(googleKey!, `${search.query} ${search.city}`, search.nextPageToken);
      places = result.places;
      nextPageToken = result.nextPageToken;
    } catch (e) {
      // An expired page token shouldn't wedge the search forever.
      if (search.nextPageToken) {
        await db.update(leadSearches).set({ nextPageToken: null, lastRunAt: new Date() }).where(eq(leadSearches.id, search.id));
      }
      throw e;
    }
  }

  const inserted = await insertLeads(userId, places, { searchId: search.id, city: search.city, category: search.category });
  await db
    .update(leadSearches)
    .set({ nextPageToken, pagesFetched: search.pagesFetched + 1, lastRunAt: new Date() })
    .where(eq(leadSearches.id, search.id));
  return inserted;
}

async function insertLeads(userId: number, places: Place[], ctx: { searchId: number | null; city: string | null; category: string | null }) {
  const rows = places.map((p) => {
    const phone = normalizePhone(p.internationalPhone, p.nationalPhone);
    return {
      userId,
      searchId: ctx.searchId,
      placeId: p.placeId,
      name: p.name.slice(0, 255),
      category: ctx.category,
      phone,
      channel: isMobileBA(phone) ? "whatsapp" : "call",
      address: p.address,
      city: ctx.city,
      website: p.website,
      mapsUrl: p.mapsUrl,
      rating: p.rating,
      reviewCount: p.reviewCount,
    };
  });
  if (rows.length === 0) return 0;
  const inserted = await db.insert(leads).values(rows).onConflictDoNothing({ target: [leads.userId, leads.placeId] }).returning({ id: leads.id });
  return inserted.length;
}

/** Businesses you found yourself, pasted one per line. */
export async function importLeadsFor(userId: number, text: string, opts: { city?: string; category?: string }) {
  const parsed = parsePastedLeads(String(text ?? "").slice(0, 50_000)).slice(0, 300);
  if (parsed.length === 0) throw new Error("Paste one business per line: name, phone, website.");
  const places: Place[] = parsed.map((p) => ({
    // Stable id so pasting the same list twice doesn't duplicate leads.
    placeId: `manual:${(p.phone ?? p.name).toLowerCase().replace(/\s+/g, "")}`.slice(0, 255),
    name: p.name,
    address: null,
    internationalPhone: p.phone,
    nationalPhone: null,
    website: p.website,
    mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${p.name} ${opts.city ?? ""}`.trim())}`,
    rating: null,
    reviewCount: null,
  }));
  const added = await insertLeads(userId, places, {
    searchId: null,
    city: String(opts.city ?? "").trim().slice(0, 100) || null,
    category: String(opts.category ?? "").trim().slice(0, 60) || null,
  });
  return { parsed: parsed.length, added };
}

async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>, deadline: number) {
  for (let i = 0; i < items.length && Date.now() < deadline; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function auditNew(userId: number, limit: number, deadline: number): Promise<number> {
  const batch = await db
    .select()
    .from(leads)
    .where(and(eq(leads.userId, userId), eq(leads.status, "new")))
    .orderBy(desc(leads.reviewCount))
    .limit(limit);
  if (batch.length === 0) return 0;

  // A phone you've already contacted (or that opted out) under another
  // listing — same clinic, two Maps entries — is never messaged twice.
  const contacted = new Set(
    (
      await db
        .select({ phone: leads.phone })
        .from(leads)
        .where(and(eq(leads.userId, userId), isNotNull(leads.phone), inArray(leads.status, ["ready", "queued", "sent", ...REPLIED_STATUSES])))
    ).map((r) => r.phone)
  );

  let done = 0;
  await inChunks(batch, 5, async (lead) => {
    let patch: Partial<Lead>;
    if (!lead.phone && !lead.website) patch = { status: "skipped", skipReason: "no_phone" };
    else if (lead.phone && contacted.has(lead.phone)) patch = { status: "skipped", skipReason: "duplicate_phone" };
    else {
      const { gaps, phone: sitePhone } = await auditWebsite(lead.website);
      // OpenStreetMap often has the website but not the phone — take it from the site.
      const phone = lead.phone ?? sitePhone;
      const channel = isMobileBA(phone) ? "whatsapp" : "call";
      if (!phone) patch = { status: "skipped", skipReason: "no_phone", gaps };
      else if (!lead.phone && contacted.has(phone)) patch = { status: "skipped", skipReason: "duplicate_phone", phone, channel };
      else if (gaps.length === 0) patch = { status: "skipped", skipReason: "no_gaps", gaps, phone, channel };
      else patch = { status: "audited", gaps, phone, channel, score: scoreLead({ ...lead, gaps, channel }) };
      if (phone) contacted.add(phone);
    }
    await db.update(leads).set({ ...patch, updatedAt: new Date() }).where(eq(leads.id, lead.id));
    done++;
  }, deadline);
  return done;
}

async function draftAudited(userId: number, cfg: Awaited<ReturnType<typeof getConfigFor>>, limit: number, deadline: number) {
  const batch = await db
    .select()
    .from(leads)
    .where(and(eq(leads.userId, userId), eq(leads.status, "audited")))
    .orderBy(desc(leads.score))
    .limit(limit);
  let done = 0;
  await inChunks(batch, 3, async (lead) => {
    const { text, variant } = await draftMessage(lead, {
      senderName: cfg.senderName,
      offer: cfg.settings.offer,
      anthropicKey: cfg.anthropicKey,
    });
    await db.update(leads).set({ status: "ready", message: text, messageVariant: variant, updatedAt: new Date() }).where(eq(leads.id, lead.id));
    done++;
  }, deadline);
  return done;
}

async function countByStatus(userId: number) {
  const rows = await db
    .select({ status: leads.status, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.userId, userId))
    .groupBy(leads.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<LeadStatus, number>>;
}

/**
 * Keep ~2 days of ready-to-send leads in stock. Bounded by `deadline` so a
 * serverless invocation never times out half-way through a write.
 */
export async function runPipelineFor(userId: number, opts: { deadline?: number } = {}) {
  const deadline = opts.deadline ?? Date.now() + 40_000;
  const cfg = await getConfigFor(userId);
  const out = { found: 0, audited: 0, drafted: 0, errors: [] as string[], exhausted: false };

  const counts = await countByStatus(userId);
  const stock = (counts.new ?? 0) + (counts.audited ?? 0) + (counts.ready ?? 0);
  const target = cfg.settings.dailyVolume * 2;

  if (stock < target) {
    await ensureDefaultSearchesFor(userId);
    for (let page = 0; page < 3 && out.found + stock < target && Date.now() < deadline - 20_000; page++) {
      try {
        const n = await discoverPage(userId, cfg.googleKey);
        if (n === null) { out.exhausted = true; break; }
        out.found += n;
      } catch (e) {
        out.errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
    }
  }
  out.audited = await auditNew(userId, 15, deadline - 12_000);
  out.drafted = await draftAudited(userId, cfg, cfg.anthropicKey ? 6 : 30, deadline);
  return out;
}

// ─── Batches ──────────────────────────────────────────────────────────────────

/** Move the best `count` ready leads into today's send list. WhatsApp first. */
export async function releaseBatchFor(userId: number, count: number, day: string, batch: number | null) {
  const picked = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.userId, userId), eq(leads.status, "ready")))
    .orderBy(sql`(${leads.channel} = 'whatsapp') desc`, desc(leads.score))
    .limit(count);
  if (picked.length === 0) return 0;
  await db
    .update(leads)
    .set({ status: "queued", queuedFor: day, batch, updatedAt: new Date() })
    .where(inArray(leads.id, picked.map((p) => p.id)));
  return picked.length;
}

async function getOrPlanDay(userId: number, settings: { batches: number; windowStart: number; windowEnd: number }, local: ReturnType<typeof localNow>) {
  const find = () => db.select().from(outreachDays).where(and(eq(outreachDays.userId, userId), eq(outreachDays.day, local.day))).limit(1);
  const [existing] = await find();
  if (existing) return existing;

  // Planned on the first tick of the day. If that's mid-window (first day,
  // or a late tick), only plan the time that's left — never a burst of
  // "overdue" batches at once.
  const start = settings.windowStart * 60;
  const end = settings.windowEnd * 60;
  const from = Math.max(start, local.minutes + 5);
  const share = (end - from) / Math.max(1, end - start);
  const n = Math.max(1, Math.round(settings.batches * share));
  const slots: OutreachSlot[] = planSlots(n, from, end).map((time, i) => ({ time, batch: i + 1 }));
  await db.insert(outreachDays).values({ userId, day: local.day, slots }).onConflictDoNothing();
  return (await find())[0];
}

export async function getTodayFor(userId: number) {
  const { settings } = await getConfigFor(userId);
  const local = localNow(settings.timezone);
  const [row] = await db.select().from(outreachDays).where(and(eq(outreachDays.userId, userId), eq(outreachDays.day, local.day))).limit(1);
  return { local, slots: row?.slots ?? [], workday: local.weekday <= 5 };
}

/** One scheduler beat. Safe to call any number of times. */
export async function tickFor(userId: number, now = new Date()) {
  const deadline = Date.now() + 45_000;
  const cfg = await getConfigFor(userId);
  if (!cfg.settings.active) return { skipped: "Outreach is paused." };
  const s = cfg.settings;
  const local = localNow(s.timezone, now);

  // Release first — it's the time-sensitive part — then refill the stock.
  let released = 0;
  if (local.weekday <= 5 && local.minutes >= s.windowStart * 60 && local.minutes < s.windowEnd * 60) {
    const day = await getOrPlanDay(userId, s, local);
    const due = day.slots.filter((sl) => !sl.releasedAt && sl.time <= local.time);
    if (due.length > 0) {
      const sizes = batchSizes(s.dailyVolume, s.batches);
      const want = due.reduce((sum, sl) => sum + (sizes[sl.batch - 1] ?? sizes[0]), 0);
      released = await releaseBatchFor(userId, want, local.day, due[due.length - 1].batch);
      // Nothing ready yet → leave the slot open; the next tick retries.
      if (released > 0) {
        const at = now.toISOString();
        const slots = day.slots.map((sl) => (due.includes(sl) ? { ...sl, releasedAt: at, count: released } : sl));
        await db.update(outreachDays).set({ slots }).where(eq(outreachDays.id, day.id));
        await notifyUser(userId, {
          title: `${released} lead${released === 1 ? "" : "s"} ready to send`,
          body: "Open Galaxus and tap send on each — about 2 minutes.",
          url: "/outreach",
          tag: `outreach-${local.day}`,
        });
      }
    }
  }
  const pipeline = await runPipelineFor(userId, { deadline });
  return { local, released, pipeline };
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function listLeadsFor(userId: number) {
  return db.select().from(leads).where(eq(leads.userId, userId)).orderBy(desc(leads.updatedAt)).limit(1000);
}

export type LeadPatch = Partial<{ status: LeadStatus; message: string; revenueKm: number | null; notes: string }>;

export async function updateLeadFor(userId: number, id: number, patch: LeadPatch) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, userId))).limit(1);
  if (!lead) throw new Error("Lead not found.");
  const set: Partial<Lead> = { updatedAt: new Date() };

  if (patch.status !== undefined) {
    if (!isLeadStatus(patch.status)) throw new Error("Unknown status.");
    set.status = patch.status;
    if (patch.status === "sent" && !lead.sentAt) set.sentAt = new Date();
    if ((REPLIED_STATUSES as string[]).includes(patch.status) && !lead.repliedAt) set.repliedAt = new Date();
    // Back to the queue (undo): it hasn't been sent after all.
    if (patch.status === "queued") Object.assign(set, { sentAt: null, repliedAt: null });
  }
  if (patch.message !== undefined) set.message = String(patch.message).slice(0, 2000);
  if (patch.notes !== undefined) set.notes = String(patch.notes).slice(0, 5000) || null;
  if (patch.revenueKm !== undefined) {
    const rev = patch.revenueKm === null || Number.isNaN(Number(patch.revenueKm)) ? null : Math.max(0, Math.round(Number(patch.revenueKm)));
    set.revenueKm = rev;
    set.score = scoreLead({ ...lead, revenueKm: rev });
  }
  const [row] = await db.update(leads).set(set).where(eq(leads.id, id)).returning();
  return row;
}

export async function redraftLeadFor(userId: number, id: number) {
  const cfg = await getConfigFor(userId);
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, userId))).limit(1);
  if (!lead) throw new Error("Lead not found.");
  const { text, variant } = await draftMessage(lead, { senderName: cfg.senderName, offer: cfg.settings.offer, anthropicKey: cfg.anthropicKey });
  const [row] = await db.update(leads).set({ message: text, messageVariant: variant, updatedAt: new Date() }).where(eq(leads.id, id)).returning();
  return row;
}

// ─── Stats & monthly review ───────────────────────────────────────────────────

export async function statsFor(userId: number, month: string) {
  const sent = await db
    .select({ status: leads.status, sentAt: leads.sentAt, messageVariant: leads.messageVariant, gaps: leads.gaps, message: leads.message })
    .from(leads)
    .where(and(eq(leads.userId, userId), isNotNull(leads.sentAt)));
  return { stats: outreachStats(sent, month), sent };
}

export async function runMonthlyReviewFor(userId: number) {
  const cfg = await getConfigFor(userId);
  if (!cfg.anthropicKey) throw new Error("Add an Anthropic API key in Setup to get a monthly review.");
  const month = localNow(cfg.settings.timezone).day.slice(0, 7);
  const { stats, sent } = await statsFor(userId, month);
  if (stats.sent === 0) throw new Error("Nothing sent this month yet — send a few batches first.");

  const thisMonth = sent.filter((l) => l.sentAt && l.sentAt.toISOString().slice(0, 7) === month && l.message);
  const replied = thisMonth.filter((l) => (REPLIED_STATUSES as string[]).includes(l.status)).slice(0, 8).map((l) => l.message!);
  const threeDaysAgo = Date.now() - 3 * 86_400_000;
  const ignored = thisMonth.filter((l) => l.status === "sent" && l.sentAt!.getTime() < threeDaysAgo).slice(0, 8).map((l) => l.message!);

  const review = await monthlyReview(cfg.anthropicKey, stats, { replied, ignored });
  await db.update(outreachSettings).set({ lastReview: review, lastReviewAt: new Date() }).where(eq(outreachSettings.userId, userId));
  return review;
}

/** Pipeline counts for the UI header. */
export async function pipelineCountsFor(userId: number) {
  return countByStatus(userId);
}
