import { db } from "@/lib/db";
import { dailyCheckins } from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import type { WeeklyDigestStats } from "@/lib/email";
import { getLeaderboardData } from "@/lib/actions/leaderboard";
import type { LeaderboardData } from "@/lib/leaderboard-utils";

/** Shared by app/api/cron/weekly-digest/route.ts (email) and the PDF report action — one query, not two. */
export async function getWeeklyStats(userId: number, since: string): Promise<WeeklyDigestStats> {
  const checkins = await db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, since)));

  return {
    daysLogged: checkins.length,
    perfectPrayerDays: checkins.filter((c) => c.fajr && c.dhuhr && c.asr && c.maghrib && c.isha).length,
    trainingDays: checkins.filter((c) => c.training).length,
    gratitudeDays: checkins.filter((c) => c.gratitude).length,
  };
}

/** getLeaderboardData() already scopes to the current user via requireUserId() and computes
 *  current/best streaks via lib/streaks.ts — reused here rather than re-derived a third time. */
export async function getAllTimeStats(): Promise<LeaderboardData> {
  return getLeaderboardData();
}
