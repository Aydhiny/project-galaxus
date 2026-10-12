// Hold the line (album + urge log), Sleep Guardian settings and focus sessions.

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyCheckins, focusSessions, memories, urgeLogs, userSettings } from "@/lib/db/schema";
import { averageSleep, isGoodNight } from "@/lib/sleep";

const MAX_PHOTO_BYTES = 900_000; // the browser resizes first; this is a safety net
const MAX_PHOTOS = 120;

// ─── Album ────────────────────────────────────────────────────────────────────

/** Metadata only — the images themselves load from /api/memories/[id]. */
export async function memoriesFor(userId: number) {
  return db.select({ id: memories.id, year: memories.year, caption: memories.caption, orderIndex: memories.orderIndex, bytes: memories.bytes })
    .from(memories).where(eq(memories.userId, userId))
    .orderBy(sql`${memories.year} asc nulls last`, asc(memories.orderIndex), asc(memories.id));
}

export async function addMemoryFor(userId: number, input: { dataUrl: string; year?: number | null; caption?: string | null }) {
  const m = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("That isn't an image.");
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_PHOTO_BYTES) throw new Error("Photo too large even after resizing.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(memories).where(eq(memories.userId, userId));
  if (n >= MAX_PHOTOS) throw new Error(`Album is full (${MAX_PHOTOS} photos).`);
  const year = input.year && input.year > 1900 && input.year < 2100 ? Math.round(input.year) : null;
  const [row] = await db.insert(memories).values({
    userId, mime: m[1], data: m[2], bytes, year, caption: input.caption?.trim().slice(0, 200) || null, orderIndex: n,
  }).returning({ id: memories.id });
  return row.id;
}

export async function updateMemoryFor(userId: number, id: number, patch: { year?: number | null; caption?: string | null }) {
  await db.update(memories).set({
    ...(patch.year !== undefined ? { year: patch.year && patch.year > 1900 && patch.year < 2100 ? Math.round(patch.year) : null } : {}),
    ...(patch.caption !== undefined ? { caption: patch.caption?.trim().slice(0, 200) || null } : {}),
  }).where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

export async function deleteMemoryFor(userId: number, id: number) {
  await db.delete(memories).where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

export async function memoryImageFor(userId: number, id: number) {
  const [row] = await db.select({ mime: memories.mime, data: memories.data }).from(memories).where(and(eq(memories.id, id), eq(memories.userId, userId))).limit(1);
  return row ?? null;
}

// ─── Urges ────────────────────────────────────────────────────────────────────

const TRIGGERS = ["tired", "alone", "late", "stressed", "bored", "phone", "sad"];

export async function logUrgeFor(userId: number, outcome: "held" | "slipped", triggers: string[] = []) {
  await db.insert(urgeLogs).values({ userId, outcome, triggers: triggers.filter((t) => TRIGGERS.includes(t)) });
}

/** "Days won this month" — any day without a slip counts; a slip only costs that one day. */
export async function holdStatsFor(userId: number) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db.select().from(urgeLogs).where(and(eq(urgeLogs.userId, userId), gte(urgeLogs.at, new Date(now.getTime() - 90 * 86_400_000)))).orderBy(desc(urgeLogs.at));
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const slipDays = new Set(rows.filter((r) => r.outcome === "slipped").map((r) => day(r.at)));
  const daysSoFar = now.getDate();
  let won = 0;
  for (let i = 0; i < daysSoFar; i++) {
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
    if (!slipDays.has(day(d))) won++;
  }
  const held = rows.filter((r) => r.outcome === "held").length;
  // Which situations come up most — your own pattern, private to you.
  const triggerCounts: Record<string, number> = {};
  for (const r of rows) for (const t of r.triggers) triggerCounts[t] = (triggerCounts[t] ?? 0) + 1;
  return {
    wonThisMonth: won, daysSoFar, heldLast90: held,
    slipDays: [...slipDays].filter((d) => d >= day(monthStart)),
    topTriggers: Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
  };
}

// ─── Sleep Guardian ───────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function sleepSettingsFor(userId: number) {
  const [s] = await db.select({ enabled: userSettings.sleepEnabled, bed: userSettings.bedTime, wake: userSettings.wakeTime }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return { enabled: s?.enabled ?? false, bedTime: s?.bed ?? "23:00", wakeTime: s?.wake ?? "07:00" };
}

/** Your own line for the Hold-the-line screen (null → a neutral default). */
export async function holdQuoteFor(userId: number) {
  const [s] = await db.select({ q: userSettings.holdQuote }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return s?.q ?? null;
}
export async function saveHoldQuoteFor(userId: number, quote: string) {
  const q = quote.trim().slice(0, 200) || null;
  await db.insert(userSettings).values({ userId, holdQuote: q }).onConflictDoUpdate({ target: userSettings.userId, set: { holdQuote: q, updatedAt: new Date() } });
}

export async function saveSleepSettingsFor(userId: number, input: { enabled: boolean; bedTime: string; wakeTime: string }) {
  if (!HHMM.test(input.bedTime) || !HHMM.test(input.wakeTime)) throw new Error("Use times like 23:00 and 07:00.");
  if (input.bedTime === input.wakeTime) throw new Error("Bedtime and wake time can't be the same.");
  const set = { sleepEnabled: !!input.enabled, bedTime: input.bedTime, wakeTime: input.wakeTime, updatedAt: new Date() };
  await db.insert(userSettings).values({ userId, ...set }).onConflictDoUpdate({ target: userSettings.userId, set });
}

// ─── Focus ────────────────────────────────────────────────────────────────────

export async function logFocusFor(userId: number, minutes: number, label: string | null, completed: boolean) {
  const m = Math.max(1, Math.min(240, Math.round(minutes)));
  await db.insert(focusSessions).values({ userId, minutes: m, label: label?.slice(0, 200) ?? null, completed });
  return m;
}

// ─── Sleep, from your check-ins ───────────────────────────────────────────────

/** Your real average bedtime (last 3 weeks of check-ins) and good nights this month. */
export async function sleepInsightsFor(userId: number) {
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const [rows, s] = await Promise.all([
    db.select({ date: dailyCheckins.date, bedTime: dailyCheckins.bedTime, wakeTime: dailyCheckins.wakeTime, sleepHours: dailyCheckins.sleepHours })
      .from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, since))),
    sleepSettingsFor(userId),
  ]);
  const thisMonth = rows.filter((r) => r.date.startsWith(month));
  return {
    average: averageSleep(rows),
    goodNightsThisMonth: thisMonth.filter((r) => isGoodNight(r, s.enabled ? s.bedTime : null)).length,
    loggedNightsThisMonth: thisMonth.filter((r) => r.bedTime || r.sleepHours).length,
  };
}

/** Hold-the-line moments marked "late night" (or after 23:00) in the last 7 days. */
export async function lateNightsFor(userId: number) {
  const rows = await db.select({ at: urgeLogs.at, triggers: urgeLogs.triggers }).from(urgeLogs)
    .where(and(eq(urgeLogs.userId, userId), gte(urgeLogs.at, new Date(Date.now() - 7 * 86_400_000))));
  return rows.filter((r) => r.triggers.includes("late") || r.at.getHours() >= 23 || r.at.getHours() < 5).length;
}
