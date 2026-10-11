// Numbers for the top-bar HUD — one small query each, all in parallel.

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { gigEmails, gigs, income, leads, tasks, userSettings } from "@/lib/db/schema";
import { completionStreak } from "@/lib/productivity";
import { levelFor, rankTitle, xpFrom } from "@/lib/hud";

const count = sql<number>`count(*)::int`;

export async function hudFor(userId: number) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = dayStart.toISOString().slice(0, 10);

  const [money, month, prefs, doneAll, todayTasks, applied, clients, newGigs, replies, recentDone] = await Promise.all([
    db.select({ km: sql<number>`coalesce(sum(${income.amountKmCents}), 0)::bigint` }).from(income).where(eq(income.userId, userId)),
    db.select({ km: sql<number>`coalesce(sum(${income.amountKmCents}), 0)::bigint` }).from(income).where(and(eq(income.userId, userId), gte(income.receivedAt, monthStart))),
    db.select({ goal: userSettings.incomeGoalKm }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({ n: count }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "done"))),
    db.select({ status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), sql`${tasks.deletedAt} is null`, sql`(${tasks.dueDate} = ${today} or (${tasks.completedAt} >= ${dayStart}))`)),
    db.select({ n: count }).from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "applied"))),
    db.select({ n: count }).from(leads).where(and(eq(leads.userId, userId), eq(leads.status, "client"))),
    db.select({ n: count, hot: sql<number>`count(*) filter (where ${gigs.score} >= 70)::int` }).from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "new"))),
    db.select({ n: count }).from(gigEmails).where(and(eq(gigEmails.userId, userId), eq(gigEmails.needsYou, true))),
    db.select({ completedAt: tasks.completedAt, status: tasks.status }).from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.completedAt), gte(tasks.completedAt, new Date(now.getTime() - 120 * 86_400_000)), inArray(tasks.status, ["done"]))),
  ]);

  const earnedKm = Math.round(Number(money[0]?.km ?? 0) / 100);
  const xp = xpFrom({ tasksDone: doneAll[0]?.n ?? 0, gigsApplied: applied[0]?.n ?? 0, clients: clients[0]?.n ?? 0, earnedKm });
  const lvl = levelFor(xp);
  return {
    monthKm: Math.round(Number(month[0]?.km ?? 0) / 100),
    totalKm: earnedKm,
    goalKm: prefs[0]?.goal ?? null,
    xp, ...lvl, rank: rankTitle(lvl.level),
    streak: completionStreak(recentDone.map((t) => ({ status: t.status, completedAt: t.completedAt })) as Parameters<typeof completionStreak>[0], now),
    tasksDone: todayTasks.filter((t) => t.status === "done").length,
    tasksToday: todayTasks.length,
    newGigs: newGigs[0]?.n ?? 0,
    hotGigs: newGigs[0]?.hot ?? 0,
    replies: replies[0]?.n ?? 0,
  };
}
export type Hud = Awaited<ReturnType<typeof hudFor>>;
