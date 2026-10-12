// Numbers for the HUD and the Level screen — small aggregate queries, all in parallel.

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  beatSales, beats, books, courses, dailyCheckins, diaryEntries, focusSessions, gameCommits, goalCompletions, monthlyGoals, gigEmails, gigs, income, leads, personalRecords,
  readingSessions, studySessions, tasks, userSettings, youtubeChannels, youtubeVideos,
} from "@/lib/db/schema";
import { completionStreak } from "@/lib/productivity";
import { rankTitle, skillLevels, type SkillCounts } from "@/lib/hud";
import { isGoodNight } from "@/lib/sleep";
import { getAchievements } from "@/lib/achievements";
import { deriveLeaderboardData } from "@/lib/leaderboard-utils";
import { isArea } from "@/lib/areas";
import { deepMinutesFor } from "@/lib/services/activity";

const count = sql<number>`count(*)::int`;
const n = (v: unknown) => Number(v ?? 0) || 0;

async function skillCountsFor(userId: number, streak: number): Promise<SkillCounts & { earnedKm: number }> {
  const [t, ck, ld, gg, money, commits, yt, bt, sold, pr, rd, bk, st, cs, jr, fc, areaT, goalsA, dg, checkinRows, sleepPref] = await Promise.all([
    db.select({ n: count }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "done"))),
    db.select({
      days: count,
      prayers: sql<number>`sum((coalesce(${dailyCheckins.fajr},false))::int + (coalesce(${dailyCheckins.dhuhr},false))::int + (coalesce(${dailyCheckins.asr},false))::int + (coalesce(${dailyCheckins.maghrib},false))::int + (coalesce(${dailyCheckins.isha},false))::int)::int`,
      quran: sql<number>`coalesce(sum(${dailyCheckins.quranPages}),0)::int`,
      trainDays: sql<number>`count(*) filter (where ${dailyCheckins.training})::int`,
      trainMin: sql<number>`coalesce(sum(${dailyCheckins.trainingMinutes}),0)::int`,
      medMin: sql<number>`coalesce(sum(${dailyCheckins.meditationMinutes}),0)::int`,
      musicMin: sql<number>`coalesce(sum(${dailyCheckins.musicMinutes}),0)::int`,
      ytDays: sql<number>`count(*) filter (where ${dailyCheckins.youtube})::int`,
    }).from(dailyCheckins).where(eq(dailyCheckins.userId, userId)),
    db.select({
      sent: sql<number>`count(*) filter (where ${leads.sentAt} is not null)::int`,
      replies: sql<number>`count(*) filter (where ${leads.repliedAt} is not null)::int`,
      clients: sql<number>`count(*) filter (where ${leads.status} = 'client')::int`,
    }).from(leads).where(eq(leads.userId, userId)),
    db.select({ applied: count, web: sql<number>`count(*) filter (where ${gigs.profileId} is not null and ${gigs.title} ~* 'web|site|developer|wordpress|shopify')::int` })
      .from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "applied"))),
    db.select({ km: sql<number>`coalesce(sum(${income.amountKmCents}), 0)::bigint` }).from(income).where(eq(income.userId, userId)),
    db.select({ n: count }).from(gameCommits).where(eq(gameCommits.userId, userId)),
    db.select({
      videos: sql<number>`count(*) filter (where not ${youtubeVideos.isShort})::int`,
      shorts: sql<number>`count(*) filter (where ${youtubeVideos.isShort})::int`,
      views: sql<number>`coalesce(sum(${youtubeVideos.views}),0)::bigint`,
    }).from(youtubeVideos).innerJoin(youtubeChannels, eq(youtubeVideos.channelRowId, youtubeChannels.id)).where(eq(youtubeChannels.userId, userId)),
    db.select({ n: count }).from(beats).where(and(eq(beats.userId, userId), inArray(beats.status, ["finished", "released", "sold"]))),
    db.select({ n: count }).from(beatSales).where(eq(beatSales.userId, userId)),
    db.select({ n: count }).from(personalRecords).where(eq(personalRecords.userId, userId)),
    db.select({ pages: sql<number>`coalesce(sum(${readingSessions.pagesRead}),0)::int` }).from(readingSessions).where(eq(readingSessions.userId, userId)),
    db.select({ n: count }).from(books).where(and(eq(books.userId, userId), isNotNull(books.completedAt))),
    db.select({ h: sql<number>`coalesce(sum(${studySessions.hours}),0)::real` }).from(studySessions).where(eq(studySessions.userId, userId)),
    db.select({ n: count }).from(courses).where(and(eq(courses.userId, userId), isNotNull(courses.completedAt))),
    db.select({ n: count }).from(diaryEntries).where(eq(diaryEntries.userId, userId)),
    db.select({ m: sql<number>`coalesce(sum(${focusSessions.minutes}),0)::int` }).from(focusSessions).where(eq(focusSessions.userId, userId)),
    db.select({ area: tasks.area, n: count }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "done"), isNotNull(tasks.area))).groupBy(tasks.area),
    db.select({ area: monthlyGoals.area, n: count }).from(monthlyGoals).where(and(eq(monthlyGoals.userId, userId), eq(monthlyGoals.status, "achieved"))).groupBy(monthlyGoals.area),
    db.select({ n: count }).from(goalCompletions).where(and(eq(goalCompletions.userId, userId), eq(goalCompletions.completed, true))),
    db.select().from(dailyCheckins).where(eq(dailyCheckins.userId, userId)),
    db.select({ bed: userSettings.bedTime, on: userSettings.sleepEnabled }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  ]);
  const deep = await deepMinutesFor(userId);
  const areaTasks: SkillCounts["areaTasks"] = {};
  for (const r of areaT) if (isArea(r.area)) areaTasks[r.area] = n(r.n);
  const areaGoals: SkillCounts["areaGoals"] = {};
  let goalsAchieved = 0;
  for (const r of goalsA) { goalsAchieved += n(r.n); if (isArea(r.area)) areaGoals[r.area] = n(r.n); }
  const targetBed = sleepPref[0]?.on ? sleepPref[0]?.bed ?? null : null;
  const goodNights = checkinRows.filter((r) => isGoodNight({ date: r.date, bedTime: r.bedTime, wakeTime: r.wakeTime, sleepHours: r.sleepHours }, targetBed)).length;
  const achievements = getAchievements(deriveLeaderboardData(checkinRows)).filter((a) => a.unlocked).length;
  const c = ck[0];
  return {
    tasksDone: n(t[0]?.n), checkinDays: n(c?.days), streak, focusMinutes: n(fc[0]?.m), goodNights, dailyGoalsDone: n(dg[0]?.n),
    areaTasks, areaGoals, goalsAchieved, achievements,
    outreachSent: n(ld[0]?.sent), outreachReplies: n(ld[0]?.replies), clients: n(ld[0]?.clients), gigsApplied: n(gg[0]?.applied),
    earnedKm: Math.round(n(money[0]?.km) / 100),
    gameCommits: n(commits[0]?.n), webClients: n(ld[0]?.clients) + n(gg[0]?.web),
    codeMinutes: deep.code + deep.gamedev, editingMinutes: deep.editing + deep.design,
    videos: n(yt[0]?.videos), shorts: n(yt[0]?.shorts), views: n(yt[0]?.views), youtubeDays: n(c?.ytDays),
    beatsFinished: n(bt[0]?.n), beatsSold: n(sold[0]?.n), musicMinutes: n(c?.musicMin) + deep.music,
    trainingDays: n(c?.trainDays), trainingMinutes: n(c?.trainMin), records: n(pr[0]?.n),
    prayers: n(c?.prayers), quranPages: n(c?.quran),
    pagesRead: n(rd[0]?.pages), booksDone: n(bk[0]?.n), studyHours: n(st[0]?.h), coursesDone: n(cs[0]?.n),
    meditationMinutes: n(c?.medMin), journalEntries: n(jr[0]?.n),
  };
}

export async function hudFor(userId: number) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = dayStart.toISOString().slice(0, 10);

  const [month, prefs, todayTasks, newGigs, replies, recentDone] = await Promise.all([
    db.select({ km: sql<number>`coalesce(sum(${income.amountKmCents}), 0)::bigint` }).from(income).where(and(eq(income.userId, userId), gte(income.receivedAt, monthStart))),
    db.select({ goal: userSettings.incomeGoalKm }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({ status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), sql`${tasks.deletedAt} is null`, sql`(${tasks.dueDate} = ${today} or (${tasks.completedAt} >= ${dayStart.toISOString()}))`)),
    db.select({ n: count, hot: sql<number>`count(*) filter (where ${gigs.score} >= 70)::int` }).from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "new"))),
    db.select({ n: count }).from(gigEmails).where(and(eq(gigEmails.userId, userId), eq(gigEmails.needsYou, true))),
    db.select({ completedAt: tasks.completedAt, status: tasks.status }).from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.completedAt), gte(tasks.completedAt, new Date(now.getTime() - 120 * 86_400_000)), eq(tasks.status, "done"))),
  ]);
  const streak = completionStreak(recentDone as Parameters<typeof completionStreak>[0], now);
  const counts = await skillCountsFor(userId, streak);
  const levels = skillLevels(counts);

  return {
    monthKm: Math.round(n(month[0]?.km) / 100),
    totalKm: counts.earnedKm,
    goalKm: prefs[0]?.goal ?? null,
    xp: levels.totalXp, level: levels.level, into: levels.into, need: levels.need, progress: levels.progress, rank: rankTitle(levels.level),
    skills: levels.skills,
    achievementXp: levels.achievementXp,
    achievements: counts.achievements,
    goodNights: counts.goodNights,
    streak,
    clients: counts.clients,
    tasksDone: todayTasks.filter((t) => t.status === "done").length,
    tasksToday: todayTasks.length,
    newGigs: n(newGigs[0]?.n),
    hotGigs: n(newGigs[0]?.hot),
    replies: n(replies[0]?.n),
  };
}
export type Hud = Awaited<ReturnType<typeof hudFor>>;
