import { format, subDays, parseISO } from "date-fns";

const OVERVIEW_KEY = "galaxus-overview";

export interface LocalDayRecord {
  date: string;
  morningDone: boolean;
  eveningDone: boolean;
  intention: string;
  priorities: string[];
  mood: number;
  eveningMood: number;
  gratitude: string[];
  dayRating: number;
  yesterdayRating: number;
  tomorrowNote: string;
  habit_Training: boolean;
  habit_Reading: boolean;
  habit_Creative: boolean;
  habit_Hydration: boolean;
  habit_Prayers: boolean;
}

export function getAllLocalRecords(): Record<string, LocalDayRecord> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(OVERVIEW_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getLocalTodayRecord(): LocalDayRecord | null {
  const today = format(new Date(), "yyyy-MM-dd");
  return getAllLocalRecords()[today] ?? null;
}

function currentStreak(records: Record<string, LocalDayRecord>, field: keyof LocalDayRecord): number {
  let streak = 0;
  let date = new Date();
  while (true) {
    const key = format(date, "yyyy-MM-dd");
    const rec = records[key];
    if (!rec || !rec[field]) break;
    streak++;
    date = subDays(date, 1);
  }
  return streak;
}

function bestStreak(records: Record<string, LocalDayRecord>, field: keyof LocalDayRecord): { streak: number; endDate: string } {
  const sorted = Object.entries(records).sort(([a], [b]) => a.localeCompare(b));
  let cur = 0, best = 0, bestEnd = "";
  let prevDate: string | null = null;

  for (const [dateStr, rec] of sorted) {
    if (rec[field]) {
      const consec =
        prevDate !== null &&
        Math.round((parseISO(dateStr).getTime() - parseISO(prevDate).getTime()) / 86400000) === 1;
      cur = consec ? cur + 1 : 1;
      if (cur > best) { best = cur; bestEnd = dateStr; }
      prevDate = dateStr;
    } else {
      cur = 0;
      prevDate = null;
    }
  }
  return { streak: best, endDate: bestEnd };
}

function gratitudeStreak(records: Record<string, LocalDayRecord>): number {
  let streak = 0;
  let date = new Date();
  while (true) {
    const key = format(date, "yyyy-MM-dd");
    const rec = records[key];
    if (!rec || !(rec.gratitude ?? []).some(Boolean)) break;
    streak++;
    date = subDays(date, 1);
  }
  return streak;
}

function bestGratitudeStreak(records: Record<string, LocalDayRecord>): { streak: number; endDate: string } {
  const sorted = Object.entries(records).sort(([a], [b]) => a.localeCompare(b));
  let cur = 0, best = 0, bestEnd = "";
  let prevDate: string | null = null;
  for (const [dateStr, rec] of sorted) {
    const has = (rec.gratitude ?? []).some(Boolean);
    if (has) {
      const consec =
        prevDate !== null &&
        Math.round((parseISO(dateStr).getTime() - parseISO(prevDate).getTime()) / 86400000) === 1;
      cur = consec ? cur + 1 : 1;
      if (cur > best) { best = cur; bestEnd = dateStr; }
      prevDate = dateStr;
    } else {
      cur = 0;
      prevDate = null;
    }
  }
  return { streak: best, endDate: bestEnd };
}

export function getLocalStreaks() {
  const all = getAllLocalRecords();
  return {
    training:   currentStreak(all, "habit_Training"),
    music:      currentStreak(all, "habit_Creative"),
    prayers:    currentStreak(all, "habit_Prayers"),
    reading:    currentStreak(all, "habit_Reading"),
    hydration:  currentStreak(all, "habit_Hydration"),
    gratitude:  gratitudeStreak(all),
    writing:    currentStreak(all, "morningDone"),
    meditation: currentStreak(all, "eveningDone"),
  };
}

export interface AllTimeStats {
  totalDays: number;
  totalMorning: number;
  totalEvening: number;
  totalGratitudes: number;
  bestDayRating: number;
  bestDayRatingDate: string;
  bestMood: number;
  bestMoodDate: string;
  bestStreaks: {
    training:  { streak: number; endDate: string };
    music:     { streak: number; endDate: string };
    prayers:   { streak: number; endDate: string };
    reading:   { streak: number; endDate: string };
    hydration: { streak: number; endDate: string };
    gratitude: { streak: number; endDate: string };
    morning:   { streak: number; endDate: string };
    evening:   { streak: number; endDate: string };
  };
  habitTotals: {
    training:  number;
    music:     number;
    prayers:   number;
    reading:   number;
    hydration: number;
  };
  topRatedDays: { date: string; rating: number }[];
  topMoodDays:  { date: string; mood: number }[];
}

export function getAllTimeStats(): AllTimeStats {
  const all = getAllLocalRecords();
  const sorted = Object.entries(all).sort(([a], [b]) => a.localeCompare(b));

  let totalDays = 0, totalMorning = 0, totalEvening = 0, totalGratitudes = 0;
  let bestDayRating = 0, bestDayRatingDate = "";
  let bestMood = 0, bestMoodDate = "";
  const habitTotals = { training: 0, music: 0, prayers: 0, reading: 0, hydration: 0 };
  const ratedDays: { date: string; rating: number }[] = [];
  const moodDays:  { date: string; mood: number }[]   = [];

  for (const [dateStr, rec] of sorted) {
    totalDays++;
    if (rec.morningDone) totalMorning++;
    if (rec.eveningDone) totalEvening++;
    totalGratitudes += (rec.gratitude ?? []).filter(Boolean).length;

    if (rec.dayRating > bestDayRating) { bestDayRating = rec.dayRating; bestDayRatingDate = dateStr; }
    const mood = Math.max(rec.mood ?? 0, rec.eveningMood ?? 0);
    if (mood > bestMood) { bestMood = mood; bestMoodDate = dateStr; }

    if (rec.habit_Training) habitTotals.training++;
    if (rec.habit_Creative) habitTotals.music++;
    if (rec.habit_Prayers)  habitTotals.prayers++;
    if (rec.habit_Reading)  habitTotals.reading++;
    if (rec.habit_Hydration) habitTotals.hydration++;

    if (rec.dayRating > 0) ratedDays.push({ date: dateStr, rating: rec.dayRating });
    if (mood > 0) moodDays.push({ date: dateStr, mood });
  }

  return {
    totalDays,
    totalMorning,
    totalEvening,
    totalGratitudes,
    bestDayRating,
    bestDayRatingDate,
    bestMood,
    bestMoodDate,
    bestStreaks: {
      training:  bestStreak(all, "habit_Training"),
      music:     bestStreak(all, "habit_Creative"),
      prayers:   bestStreak(all, "habit_Prayers"),
      reading:   bestStreak(all, "habit_Reading"),
      hydration: bestStreak(all, "habit_Hydration"),
      gratitude: bestGratitudeStreak(all),
      morning:   bestStreak(all, "morningDone"),
      evening:   bestStreak(all, "eveningDone"),
    },
    habitTotals,
    topRatedDays: ratedDays.sort((a, b) => b.rating - a.rating).slice(0, 5),
    topMoodDays:  moodDays.sort((a, b) => b.mood - a.mood).slice(0, 5),
  };
}
