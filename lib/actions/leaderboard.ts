"use server";

import { db } from "@/lib/db";
import { dailyCheckins } from "@/lib/db/schema";
import { parseISO } from "date-fns";

type Row = typeof dailyCheckins.$inferSelect;

function computeCurrentStreak(sorted: Row[], field: keyof Row): number {
  // sorted descending
  let streak = 0;
  let expectedDate: Date | null = null;

  for (const row of sorted) {
    const d = parseISO(row.date);
    if (expectedDate === null) {
      // first row must be today or yesterday to count
      const today = new Date(); today.setHours(0,0,0,0);
      const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
      if (diffDays > 1) break; // gap at start — no streak
      if (!row[field]) break;
      streak = 1;
      expectedDate = new Date(d); expectedDate.setDate(d.getDate() - 1);
    } else {
      d.setHours(0,0,0,0); expectedDate.setHours(0,0,0,0);
      if (d.getTime() !== expectedDate.getTime()) break;
      if (!row[field]) break;
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    }
  }
  return streak;
}

function computeBestStreak(sorted: Row[], field: keyof Row): { streak: number; endDate: string } {
  // sorted ascending
  let cur = 0, best = 0, bestEnd = "";
  let prevDate: Date | null = null;

  for (const row of sorted) {
    const d = parseISO(row.date);
    d.setHours(0,0,0,0);

    if (row[field]) {
      const consec = prevDate !== null &&
        Math.round((d.getTime() - prevDate.getTime()) / 86400000) === 1;
      cur = consec ? cur + 1 : 1;
      if (cur > best) { best = cur; bestEnd = row.date; }
      prevDate = d;
    } else {
      cur = 0;
      prevDate = null;
    }
  }
  return { streak: best, endDate: bestEnd };
}

function prayerStreak(sorted: Row[]): number {
  let streak = 0;
  for (const row of sorted) {
    if (row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha) streak++;
    else break;
  }
  return streak;
}

function bestPrayerStreak(asc: Row[]): { streak: number; endDate: string } {
  let cur = 0, best = 0, bestEnd = "";
  let prevDate: Date | null = null;
  for (const row of asc) {
    const allFive = row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha;
    const d = parseISO(row.date); d.setHours(0,0,0,0);
    if (allFive) {
      const consec = prevDate !== null &&
        Math.round((d.getTime() - prevDate.getTime()) / 86400000) === 1;
      cur = consec ? cur + 1 : 1;
      if (cur > best) { best = cur; bestEnd = row.date; }
      prevDate = d;
    } else {
      cur = 0; prevDate = null;
    }
  }
  return { streak: best, endDate: bestEnd };
}

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

export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    const all = await db.select().from(dailyCheckins).orderBy(dailyCheckins.date);
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
