import { parseISO } from "date-fns";
import type { DailyCheckin } from "@/lib/db/schema";

type Row = DailyCheckin;

export function computeCurrentStreak(sorted: Row[], field: keyof Row): number {
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

export function computeBestStreak(sorted: Row[], field: keyof Row): { streak: number; endDate: string } {
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

export function prayerStreak(sorted: Row[]): number {
  let streak = 0;
  for (const row of sorted) {
    if (row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha) streak++;
    else break;
  }
  return streak;
}

export function bestPrayerStreak(asc: Row[]): { streak: number; endDate: string } {
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
