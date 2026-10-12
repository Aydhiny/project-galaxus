// Automatic tracking: desktop deep work, doomscroll minutes, presence (for
// sleep), beats from new FL Studio projects, one-tap prayers, auto devlogs and
// prayer-time pushes. Only categories and seconds are stored.

import { and, eq, gte, ilike, inArray, like, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityMinutes, beats, dailyCheckins, gameCommits, outreachSettings, pushSubscriptions, taskRuns, userSettings, voiceCommands } from "@/lib/db/schema";
import { DEEP_CATEGORIES, classify, detectNight, hhmm, isDoomscrolling, type Category, type DeepCategory } from "@/lib/activity";
import { localNow } from "@/lib/outreach";
import { VAKAT } from "@/lib/vaktija";
import { prayerSettingsFor, vaktijaFor } from "@/lib/services/prayer";
import { notifyUser } from "@/lib/services/outreach/push";
import { devlogFromCommitsFor } from "@/lib/services/game";

const n = (v: unknown) => Number(v ?? 0) || 0;
type Sample = { minute: number; app: string; site?: string | null; secs: number };

async function tzFor(userId: number) {
  const [s] = await db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  return s?.tz ?? "Europe/Sarajevo";
}

/** Store a batch from the desktop app (minute → app). Unknown apps are dropped right here. */
export async function logActivityFor(userId: number, samples: Sample[]) {
  const nowMin = Math.floor(Date.now() / 60_000);
  const agg = new Map<string, { minute: number; category: Category; secs: number }>();
  for (const s of samples.slice(0, 5000)) {
    const minute = Math.floor(Number(s.minute));
    if (!(minute <= nowMin && minute > nowMin - 4 * 1440)) continue;
    const category = classify(String(s.app ?? "").slice(0, 120), s.site ? String(s.site).slice(0, 20) : null);
    if (!category) continue;
    const k = `${minute}:${category}`;
    const cur = agg.get(k) ?? { minute, category, secs: 0 };
    cur.secs = Math.min(60, cur.secs + Math.max(0, Math.round(Number(s.secs) || 0)));
    agg.set(k, cur);
  }
  const rows = [...agg.values()].filter((r) => r.secs >= 5).map((r) => ({ userId, minute: new Date(r.minute * 60_000), category: r.category, secs: r.secs }));
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(activityMinutes).values(rows.slice(i, i + 500))
      .onConflictDoUpdate({ target: [activityMinutes.userId, activityMinutes.minute, activityMinutes.category], set: { secs: sql`least(60, ${activityMinutes.secs} + excluded.secs)` } });
  }
  return { stored: rows.length };
}

/** "Galaxus is open on some device right now" — one row a minute, used to find bed and wake time. */
export async function logPresenceFor(userId: number) {
  const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  await db.insert(activityMinutes).values({ userId, minute, category: "presence", secs: 60 }).onConflictDoNothing();
}

/** What's happening now: deep work today, what's active, and the doomscroll guard. */
export async function activityStatusFor(userId: number) {
  const tz = await tzFor(userId);
  const local = localNow(tz);
  const dayStart = new Date(Date.now() - local.minutes * 60_000);
  const [today, recent] = await Promise.all([
    db.select({ category: activityMinutes.category, secs: sql<number>`sum(${activityMinutes.secs})::int` }).from(activityMinutes)
      .where(and(eq(activityMinutes.userId, userId), gte(activityMinutes.minute, dayStart))).groupBy(activityMinutes.category),
    db.select({ category: activityMinutes.category, minute: activityMinutes.minute, secs: activityMinutes.secs }).from(activityMinutes)
      .where(and(eq(activityMinutes.userId, userId), gte(activityMinutes.minute, new Date(Date.now() - 30 * 60_000)))),
  ]);
  const deepToday: Partial<Record<DeepCategory, number>> = {};
  for (const r of today) if ((DEEP_CATEGORIES as readonly string[]).includes(r.category)) deepToday[r.category as DeepCategory] = Math.round(n(r.secs) / 60);
  const scroll30 = recent.filter((r) => r.category === "scroll" && r.secs >= 20).length;
  const tenAgo = Date.now() - 10 * 60_000;
  const activeNow = [...new Set(recent.filter((r) => r.minute.getTime() >= tenAgo && (DEEP_CATEGORIES as readonly string[]).includes(r.category)).map((r) => r.category as DeepCategory))];
  return { deepToday, activeNow, scroll30, doomscrolling: isDoomscrolling(scroll30) };
}

/** All-time deep-work minutes per category (feeds skill XP). */
export async function deepMinutesFor(userId: number) {
  const rows = await db.select({ category: activityMinutes.category, secs: sql<number>`sum(${activityMinutes.secs})::bigint` }).from(activityMinutes)
    .where(and(eq(activityMinutes.userId, userId), inArray(activityMinutes.category, [...DEEP_CATEGORIES]))).groupBy(activityMinutes.category);
  const out: Record<DeepCategory, number> = { code: 0, gamedev: 0, music: 0, editing: 0, design: 0 };
  for (const r of rows) out[r.category as DeepCategory] = Math.round(n(r.secs) / 60);
  return out;
}

const prevDay = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

/**
 * Last night, from when you were last and first active (any device, any app).
 * Fills bed/wake time on today's check-in — never overwrites what you typed.
 */
export async function autoSleepFor(userId: number) {
  const tz = await tzFor(userId);
  const today = localNow(tz).day, yesterday = prevDay(today);
  const rows = await db.select({ minute: activityMinutes.minute }).from(activityMinutes)
    .where(and(eq(activityMinutes.userId, userId), gte(activityMinutes.minute, new Date(Date.now() - 34 * 3_600_000))));
  const offsets: number[] = [];
  for (const r of rows) {
    const l = localNow(tz, r.minute);
    if (l.day === today) offsets.push(l.minutes);
    else if (l.day === yesterday && l.minutes >= 12 * 60) offsets.push(l.minutes - 1440);
  }
  const night = detectNight(offsets);
  if (!night || night.wake < 3 * 60 || night.wake > 13 * 60) return { found: false };
  const bedTime = hhmm(night.bed), wakeTime = hhmm(night.wake), sleepHours = Math.round(((night.wake - night.bed) / 60) * 10) / 10;
  const [existing] = await db.select().from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, today))).limit(1);
  if (existing) {
    if (existing.bedTime || existing.wakeTime) return { found: true, kept: "your own entry" };
    await db.update(dailyCheckins).set({ bedTime, wakeTime, sleepHours }).where(eq(dailyCheckins.id, existing.id));
  } else {
    await db.insert(dailyCheckins).values({ userId, date: today, bedTime, wakeTime, sleepHours });
  }
  return { found: true, bedTime, wakeTime, sleepHours };
}

/** One tap from the notification / toast: mark a prayer prayed on today's check-in. */
export async function logPrayerFor(userId: number, prayer: string, date?: string) {
  const key = VAKAT.find((v) => v.key === prayer && v.azan)?.key;
  if (!key) throw new Error("Unknown prayer.");
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localNow(await tzFor(userId)).day;
  const set = { [key]: true } as Partial<typeof dailyCheckins.$inferInsert>;
  const [existing] = await db.select({ id: dailyCheckins.id }).from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, day))).limit(1);
  if (existing) await db.update(dailyCheckins).set(set).where(eq(dailyCheckins.id, existing.id));
  else await db.insert(dailyCheckins).values({ userId, date: day, ...set });
  return { prayer: key, date: day };
}

/** New FL Studio (or other DAW) projects → Beat Catalog drafts. Names you already have are skipped. */
export async function beatsFromFilesFor(userId: number, files: { name: string; modifiedMs: number }[]) {
  let added = 0;
  for (const f of files.slice(0, 25)) {
    const name = String(f.name ?? "").replace(/\s+/g, " ").trim().slice(0, 255);
    if (!name || /^(untitled|new project|template)/i.test(name)) continue;
    const [dupe] = await db.select({ id: beats.id }).from(beats).where(and(eq(beats.userId, userId), ilike(beats.name, name))).limit(1);
    if (dupe) continue;
    const day = new Date(Number(f.modifiedMs) || Date.now()).toISOString().slice(0, 10);
    await db.insert(beats).values({ userId, name, status: "draft", producedAt: day, notes: "Added automatically from your project folder." });
    added++;
  }
  return { added };
}

/** Commits today and no devlog yet → Claude drafts one (lands in YouTube → Work). */
export async function autoDevlogFor(userId: number) {
  const since = new Date(Date.now() - 18 * 3_600_000);
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(gameCommits).where(and(eq(gameCommits.userId, userId), gte(gameCommits.committedAt, since)));
  if (!n(c?.n)) return { skipped: "no commits today" };
  const [recent] = await db.select({ id: voiceCommands.id }).from(voiceCommands)
    .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.kind, "devlog"), gte(voiceCommands.createdAt, since))).limit(1);
  if (recent) return { skipped: "devlog already queued today" };
  try {
    await devlogFromCommitsFor(userId);
    return { queued: true };
  } catch (e) {
    return { skipped: (e as Error).message };
  }
}

/**
 * Prayer time → a push with a "Prayed ✓" button (Android / desktop; iPhone
 * shows the notification without buttons). Sent once per prayer, only if you
 * have notifications on and prayer reminders enabled.
 */
export async function prayerPushFor(userId: number) {
  const [s] = await db.select({ on: userSettings.notifyPrayerReminders }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (s && s.on === false) return { skipped: "reminders off" };
  const [sub] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
  if (!sub) return { skipped: "no push device" };
  const prefs = await prayerSettingsFor(userId);
  const v = await vaktijaFor(prefs.location);
  if (!v) return { skipped: "no times" };
  const local = localNow(await tzFor(userId));
  const sent: string[] = [];
  for (let i = 0; i < 6; i++) {
    const meta = VAKAT[i];
    if (!meta.azan) continue;
    const [h, m] = v.times[i].split(":").map(Number);
    const since = local.minutes - (h * 60 + m);
    if (since < 0 || since > 25) continue;
    const task = `prayer:${local.day}:${meta.key}`;
    const done = await db.insert(taskRuns).values({ userId, task, lastRunAt: new Date(), lastResult: "sent" }).onConflictDoNothing().returning({ id: taskRuns.id });
    if (!done.length) continue; // already sent
    await notifyUser(userId, {
      title: `🕌 ${meta.bs} · ${v.times[i]}`,
      body: "Vrijeme je za namaz. Tap ✓ when you've prayed.",
      url: "/spiritual",
      tag: task,
      actions: [{ action: "prayed", title: "Prayed ✓" }],
      data: { prayer: meta.key, date: local.day },
    }, { bell: false });
    sent.push(meta.key);
  }
  return { sent };
}

/** Old per-minute rows aren't needed forever (120 days), nor are old "prayer push sent" markers. */
export async function pruneActivityFor(userId: number) {
  await db.delete(activityMinutes).where(and(eq(activityMinutes.userId, userId), sql`${activityMinutes.minute} < now() - interval '120 days'`));
  await db.delete(taskRuns).where(and(eq(taskRuns.userId, userId), like(taskRuns.task, "prayer:%"), lt(taskRuns.lastRunAt, new Date(Date.now() - 3 * 86_400_000))));
  return { ok: true };
}

