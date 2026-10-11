// "Everything this week" for the Weekly Review — one place where all of
// Galaxus meets: money, deals, gigs, outreach, focus, discipline, diary,
// YouTube and your level. Small aggregate queries, run in parallel.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  diaryEntries, focusSessions, gigEmails, gigs, income, leads, tasks, urgeLogs, youtubeChannels, youtubeVideos,
} from "@/lib/db/schema";
import { dealsFor } from "@/lib/services/deals";
import { hudFor } from "@/lib/services/hud";

const count = sql<number>`count(*)::int`;
const n = (v: unknown) => Number(v ?? 0) || 0;

export async function weekOverviewFor(userId: number, start: Date, end: Date) {
  const inWeek = (col: AnyPgColumn) => and(gte(col, start), lt(col, end));
  const [money, tasksDone, focus, gigNew, gigApplied, emailsSent, emailReplies, outreachSent, outreachReplies, diary, slips, videos, deals, hud] = await Promise.all([
    db.select({ km: sql<number>`coalesce(sum(${income.amountKmCents}),0)::bigint` }).from(income).where(and(eq(income.userId, userId), inWeek(income.receivedAt))),
    db.select({ n: count }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "done"), inWeek(tasks.completedAt))),
    db.select({ m: sql<number>`coalesce(sum(${focusSessions.minutes}),0)::int`, s: count }).from(focusSessions).where(and(eq(focusSessions.userId, userId), inWeek(focusSessions.startedAt))),
    db.select({ n: count }).from(gigs).where(and(eq(gigs.userId, userId), inWeek(gigs.createdAt))),
    db.select({ n: count }).from(gigs).where(and(eq(gigs.userId, userId), eq(gigs.status, "applied"), inWeek(gigs.actedAt))),
    db.select({ n: count }).from(gigEmails).where(and(eq(gigEmails.userId, userId), eq(gigEmails.status, "sent"), inWeek(gigEmails.sentAt))),
    db.select({ n: count }).from(gigEmails).where(and(eq(gigEmails.userId, userId), inWeek(gigEmails.lastReplyAt))),
    db.select({ n: count }).from(leads).where(and(eq(leads.userId, userId), inWeek(leads.sentAt))),
    db.select({ n: count }).from(leads).where(and(eq(leads.userId, userId), inWeek(leads.repliedAt))),
    db.select({ mood: diaryEntries.mood, kind: diaryEntries.kind }).from(diaryEntries).where(and(eq(diaryEntries.userId, userId), inWeek(diaryEntries.date))),
    db.select({ at: urgeLogs.at, outcome: urgeLogs.outcome }).from(urgeLogs).where(and(eq(urgeLogs.userId, userId), inWeek(urgeLogs.at))),
    db.select({ n: count, views: sql<number>`coalesce(sum(${youtubeVideos.views}),0)::bigint` }).from(youtubeVideos)
      .innerJoin(youtubeChannels, eq(youtubeVideos.channelRowId, youtubeChannels.id)).where(and(eq(youtubeChannels.userId, userId), inWeek(youtubeVideos.publishedAt))),
    dealsFor(userId),
    hudFor(userId),
  ]);

  const days = Math.max(1, Math.min(7, Math.ceil((Math.min(Date.now(), end.getTime()) - start.getTime()) / 86_400_000)));
  const slipDays = new Set(slips.filter((s) => s.outcome === "slipped").map((s) => s.at.toISOString().slice(0, 10))).size;
  const moods: Record<string, number> = {};
  for (const d of diary) if (d.mood) moods[d.mood] = (moods[d.mood] ?? 0) + 1;
  const open = deals.filter((d) => !["won", "lost"].includes(d.stage));
  return {
    earnedKm: Math.round(n(money[0]?.km) / 100),
    tasksDone: n(tasksDone[0]?.n),
    focusMinutes: n(focus[0]?.m), focusSessions: n(focus[0]?.s),
    gigsNew: n(gigNew[0]?.n), gigsApplied: n(gigApplied[0]?.n) + n(emailsSent[0]?.n), gigReplies: n(emailReplies[0]?.n),
    outreachSent: n(outreachSent[0]?.n), outreachReplies: n(outreachReplies[0]?.n),
    dealsOpen: open.length, dealsReady: deals.filter((d) => d.stage === "ready").length, pipelineKm: open.reduce((s, d) => s + (d.valueKm ?? 0), 0),
    diaryEntries: diary.filter((d) => d.kind === "diary").length, gratitudes: diary.filter((d) => d.kind === "gratitude").length, moods,
    daysWon: days - slipDays, days, held: slips.filter((s) => s.outcome === "held").length,
    videos: n(videos[0]?.n), videoViews: n(videos[0]?.views),
    level: hud.level, rank: hud.rank, xp: hud.xp, progress: hud.progress, goodNights: hud.goodNights,
  };
}
export type WeekOverview = Awaited<ReturnType<typeof weekOverviewFor>>;
