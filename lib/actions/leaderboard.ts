"use server";

import { db } from "@/lib/db";
import { dailyCheckins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth-session";
import { computeCurrentStreak, computeBestStreak, prayerStreak, bestPrayerStreak } from "@/lib/streaks";

export interface LeaderboardData {
  totalDays: number;
  totalGratitudes: number;
  bestDayRating: number;
  bestDayRatingDate: string;
  bestMood: number;
  bestMoodDate: string;
  currentStreaks: { training: number; prayers: number; music: number; writing: number; gratitude: number; meditation: number };
  bestStreaks: {
    training:  { streak: number; endDate: string };
    prayers:   { streak: number; endDate: string };
    music:     { streak: number; endDate: string };
    writing:   { streak: number; endDate: string };
    gratitude: { streak: number; endDate: string };
    meditation:{ streak: number; endDate: string };
  };
  habitTotals: { training: number; prayers: number; music: number; writing: number; gratitude: number; meditation: number };
  topRatedDays: { date: string; rating: number }[];
  topMoodDays:  { date: string; mood: number }[];
}

/**
 * Despite the name, this returns the current user's own stats/streaks —
 * not a cross-user public leaderboard. Surfacing other users' habit and
 * prayer data by default is a privacy decision (opt-in visibility, etc.)
 * that deserves its own product conversation.
 */
export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    const userId = await requireUserId();
    const all = await db.select().from(dailyCheckins).where(eq(dailyCheckins.userId, userId)).orderBy(dailyCheckins.date);
    const asc  = all;
    const desc = [...all].reverse();

    let totalDays = 0, totalGratitudes = 0;
    let bestDayRating = 0, bestDayRatingDate = "";
    let bestMood = 0, bestMoodDate = "";
    const habitTotals = { training: 0, prayers: 0, music: 0, writing: 0, gratitude: 0, meditation: 0 };
    const ratedDays: { date: string; rating: number }[] = [];
    const moodDays:  { date: string; mood: number }[]   = [];

    for (const row of asc) {
      totalDays++;
      if (row.gratitude) totalGratitudes++;
      if (row.training)   habitTotals.training++;
      const prayers = row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha;
      if (prayers) habitTotals.prayers++;
      if (row.music)      habitTotals.music++;
      if (row.writing)    habitTotals.writing++;
      if (row.gratitude)  habitTotals.gratitude++;
      if (row.meditation) habitTotals.meditation++;

      if ((row.dayRating ?? 0) > bestDayRating) { bestDayRating = row.dayRating!; bestDayRatingDate = row.date; }
      const mood = Math.max(row.morningMood ?? 0, row.eveningMood ?? 0);
      if (mood > bestMood) { bestMood = mood; bestMoodDate = row.date; }

      if (row.dayRating && row.dayRating > 0) ratedDays.push({ date: row.date, rating: row.dayRating });
      if (mood > 0) moodDays.push({ date: row.date, mood });
    }

    return {
      totalDays,
      totalGratitudes,
      bestDayRating,
      bestDayRatingDate,
      bestMood,
      bestMoodDate,
      currentStreaks: {
        training:   computeCurrentStreak(desc, "training"),
        prayers:    prayerStreak(desc),
        music:      computeCurrentStreak(desc, "music"),
        writing:    computeCurrentStreak(desc, "writing"),
        gratitude:  computeCurrentStreak(desc, "gratitude"),
        meditation: computeCurrentStreak(desc, "meditation"),
      },
      bestStreaks: {
        training:   computeBestStreak(asc, "training"),
        prayers:    bestPrayerStreak(asc),
        music:      computeBestStreak(asc, "music"),
        writing:    computeBestStreak(asc, "writing"),
        gratitude:  computeBestStreak(asc, "gratitude"),
        meditation: computeBestStreak(asc, "meditation"),
      },
      habitTotals,
      topRatedDays: ratedDays.sort((a, b) => b.rating - a.rating).slice(0, 5),
      topMoodDays:  moodDays.sort((a, b) => b.mood - a.mood).slice(0, 5),
    };
  } catch {
    return {
      totalDays: 0, totalGratitudes: 0, bestDayRating: 0, bestDayRatingDate: "",
      bestMood: 0, bestMoodDate: "",
      currentStreaks: { training: 0, prayers: 0, music: 0, writing: 0, gratitude: 0, meditation: 0 },
      bestStreaks: {
        training:   { streak: 0, endDate: "" }, prayers:   { streak: 0, endDate: "" },
        music:      { streak: 0, endDate: "" }, writing:   { streak: 0, endDate: "" },
        gratitude:  { streak: 0, endDate: "" }, meditation:{ streak: 0, endDate: "" },
      },
      habitTotals: { training: 0, prayers: 0, music: 0, writing: 0, gratitude: 0, meditation: 0 },
      topRatedDays: [], topMoodDays: [],
    };
  }
}
