// Real-life signals that bring the city to life: weather from your week,
// construction for goals, ruins for neglect, and live events (emails, replies,
// payments, hot gigs, Claude jobs) that become trucks, pings and beams.

import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dailyCheckins, diaryEntries, gameCommits, gigEmails, gigs, income, monthlyGoals, opportunities, taskRuns, tasks, voiceCommands,
} from "@/lib/db/schema";
import { isNeglected, jobTarget, weatherFor, type World, type WorldEvent } from "@/lib/empire-world";

const n = (v: unknown) => Number(v ?? 0) || 0;
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function worldFor(userId: number, hud: { streak: number; monthKm: number; goalKm: number | null }): Promise<World> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const recent = new Date(now.getTime() - 6 * 3_600_000);
  const twoDays = new Date(now.getTime() - 48 * 3_600_000);
  const month = now.toISOString().slice(0, 7);
  const prayerSum = sql<number>`(${dailyCheckins.fajr}::int + ${dailyCheckins.dhuhr}::int + ${dailyCheckins.asr}::int + ${dailyCheckins.maghrib}::int + ${dailyCheckins.isha}::int)`;

  const [doneDays, checkins, prayed30, goals, goalTasks, last, mails, replies, money, hot, jobs, airships, gigsRun] = await Promise.all([
    db.select({ d: sql<string>`to_char(${tasks.completedAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "done"), gte(tasks.completedAt, weekAgo))).groupBy(sql`1`),
    db.select({ date: dailyCheckins.date, prayers: prayerSum }).from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, day(weekAgo)))),
    db.select({ n: sql<number>`count(*)::int` }).from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, day(monthAgo)), sql`${prayerSum} > 0`)),
    db.select().from(monthlyGoals).where(and(eq(monthlyGoals.userId, userId), eq(monthlyGoals.month, month), inArray(monthlyGoals.status, ["active", "achieved"]))).orderBy(monthlyGoals.createdAt).limit(6),
    db.select({ goalId: tasks.goalId, total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int` })
      .from(tasks).where(and(eq(tasks.userId, userId), isNotNull(tasks.goalId))).groupBy(tasks.goalId),
    // Last activity per neglect-able building.
    db.select({
      studio: sql<Date | null>`(select max(${gameCommits.committedAt}) from ${gameCommits} where ${gameCommits.userId} = ${userId})`,
      youtube: sql<Date | null>`(select max(v.published_at) from youtube_videos v join youtube_channels c on v.channel_row_id = c.id where c.user_id = ${userId})`,
      gym: sql<string | null>`(select max(${dailyCheckins.date})::text from ${dailyCheckins} where ${dailyCheckins.userId} = ${userId} and ${dailyCheckins.training})`,
      mosque: sql<string | null>`(select max(${dailyCheckins.date})::text from ${dailyCheckins} where ${dailyCheckins.userId} = ${userId} and ${prayerSum} > 0)`,
      library: sql<Date | null>`(select max(${diaryEntries.date}) from ${diaryEntries} where ${diaryEntries.userId} = ${userId})`,
    }).from(sql`(select 1) as one`),
    db.select({ id: gigEmails.id, at: gigEmails.createdAt, status: gigEmails.status, subject: gigEmails.subject }).from(gigEmails)
      .where(and(eq(gigEmails.userId, userId), inArray(gigEmails.status, ["sent", "shadow"]), gte(gigEmails.createdAt, recent))).orderBy(desc(gigEmails.createdAt)).limit(12),
    db.select({ id: gigEmails.id, at: gigEmails.lastReplyAt, needsYou: gigEmails.needsYou }).from(gigEmails)
      .where(and(eq(gigEmails.userId, userId), gte(gigEmails.lastReplyAt, recent))).orderBy(desc(gigEmails.lastReplyAt)).limit(8),
    db.select({ id: income.id, at: income.receivedAt, cents: income.amountKmCents, source: income.source }).from(income)
      .where(and(eq(income.userId, userId), gte(income.receivedAt, twoDays))).orderBy(desc(income.receivedAt)).limit(8),
    db.select({ id: gigs.id, at: gigs.createdAt, title: gigs.title }).from(gigs)
      .where(and(eq(gigs.userId, userId), gte(gigs.createdAt, recent), gte(gigs.score, 70))).orderBy(desc(gigs.createdAt)).limit(8),
    db.select({ id: voiceCommands.id, at: voiceCommands.finishedAt, kind: voiceCommands.kind }).from(voiceCommands)
      .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.status, "done"), gte(voiceCommands.finishedAt, recent))).orderBy(desc(voiceCommands.finishedAt)).limit(8),
    db.select({ id: opportunities.id, title: opportunities.title, kind: opportunities.kind, deadline: opportunities.deadline, score: opportunities.score }).from(opportunities)
      .where(and(eq(opportunities.userId, userId), eq(opportunities.status, "new"), gte(opportunities.score, 60), gte(opportunities.createdAt, new Date(now.getTime() - 7 * 86_400_000))))
      .orderBy(desc(opportunities.score)).limit(4),
    db.select({ at: taskRuns.lastRunAt }).from(taskRuns).where(and(eq(taskRuns.userId, userId), eq(taskRuns.task, "gigs"))).limit(1),
  ]);

  // Weather
  const active = new Set([...doneDays.filter((d) => n(d.n) > 0).map((d) => d.d), ...checkins.filter((c) => n(c.prayers) > 0).map((c) => String(c.date))]);
  const weather = weatherFor({
    tasksDone: doneDays.reduce((s, d) => s + n(d.n), 0),
    prayers: checkins.reduce((s, c) => s + n(c.prayers), 0),
    tracksPrayers: n(prayed30[0]?.n) > 0,
    activeDays: Math.min(7, active.size),
    days: 7,
  });

  // Construction sites
  const progress = new Map(goalTasks.map((g) => [g.goalId, g.total ? n(g.done) / n(g.total) : 0]));
  const sites = goals.map((g) => {
    const p = g.status === "achieved" ? 1 : progress.get(g.id) ?? 0;
    return { id: g.id, title: g.title, emoji: g.emoji, done: p >= 1, progress: p }; // every task done = the building opens
  });

  // Ruins
  const l = last[0];
  const toDate = (v: unknown) => (v ? new Date(v as string) : null);
  const neglected = (["studio", "youtube", "gym", "mosque", "library"] as const).filter((k) => isNeglected(toDate(l?.[k]), now));

  // Live events
  const events: WorldEvent[] = [
    ...mails.map((m) => ({ id: `mail:${m.id}`, type: "mail" as const, at: (m.at ?? now).toISOString(), label: m.status === "sent" ? "Email sent" : "Email drafted" })),
    ...replies.filter((r) => r.at).map((r) => ({ id: `reply:${r.id}:${r.at!.getTime()}`, type: "reply" as const, at: r.at!.toISOString(), label: r.needsYou ? "Reply — needs you" : "Reply received" })),
    ...money.map((m) => ({ id: `money:${m.id}`, type: "money" as const, at: m.at.toISOString(), label: `+${Math.round(m.cents / 100)} KM`, amount: Math.round(m.cents / 100), source: m.source })),
    ...hot.map((g) => ({ id: `hot:${g.id}`, type: "hotgig" as const, at: (g.at ?? now).toISOString(), label: g.title.slice(0, 60) })),
    ...jobs.filter((j) => j.at).map((j) => ({ id: `job:${j.id}`, type: "job" as const, at: j.at!.toISOString(), label: "Claude finished a job", target: jobTarget(j.kind) })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const gold = hud.goalKm ? Math.min(1, hud.monthKm / hud.goalKm) : Math.min(1, Math.log10(hud.monthKm + 1) / 4);
  const lastScan = gigsRun[0]?.at;
  return {
    weather, streak: hud.streak, gold, goals: sites, neglected, events,
    airships: airships.map((a) => ({ ...a, deadline: a.deadline?.toISOString() ?? null })),
    radarScanning: !!lastScan && now.getTime() - lastScan.getTime() < 12 * 60_000,
    distracted: false, // set by empireFor from live activity
  };
}
