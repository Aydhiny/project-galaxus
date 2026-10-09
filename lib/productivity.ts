// Pure productivity stats derived from tasks. Everything is bucketed by the
// viewer's LOCAL calendar day (completedAt is a UTC timestamp), so this runs
// on the client where the browser knows the user's timezone.

import { addDays, format, startOfDay, subDays } from "date-fns";

export interface CompletableTask {
  status: string;
  completedAt: Date | string | null;
}

export interface DayCount {
  date: string; // yyyy-MM-dd (local)
  label: string; // short label for charts, e.g. "Mon 6"
  count: number;
}

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

function completedDayKey(t: CompletableTask): string | null {
  if (t.status !== "done" || !t.completedAt) return null;
  const d = typeof t.completedAt === "string" ? new Date(t.completedAt) : t.completedAt;
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

/** Map of local day → number of tasks completed that day. */
export function countByDay(tasks: CompletableTask[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tasks) {
    const k = completedDayKey(t);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** One entry per day for the last `days` days, oldest first, ending today. */
export function completionsByDay(tasks: CompletableTask[], days: number, now: Date = new Date()): DayCount[] {
  const counts = countByDay(tasks);
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(today, days - 1 - i);
    const k = dayKey(d);
    return { date: k, label: format(d, days <= 7 ? "EEE" : days <= 14 ? "d" : "MMM d"), count: counts.get(k) ?? 0 };
  });
}

/**
 * Consecutive days with at least one completed task. Today counts if you've
 * already completed something; if not, the streak is still "alive" from
 * yesterday (you have until midnight), so we count back from yesterday.
 */
export function completionStreak(tasks: CompletableTask[], now: Date = new Date()): number {
  const counts = countByDay(tasks);
  let cursor = startOfDay(now);
  if (!counts.get(dayKey(cursor))) cursor = subDays(cursor, 1);
  let streak = 0;
  while (counts.get(dayKey(cursor))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

/** Completions in the last 7 days (incl. today) vs the 7 days before that. */
export function weekOverWeek(tasks: CompletableTask[], now: Date = new Date()): { thisWeek: number; lastWeek: number } {
  const counts = countByDay(tasks);
  const today = startOfDay(now);
  let thisWeek = 0;
  let lastWeek = 0;
  for (let i = 0; i < 14; i++) {
    const c = counts.get(dayKey(subDays(today, i))) ?? 0;
    if (i < 7) thisWeek += c; else lastWeek += c;
  }
  return { thisWeek, lastWeek };
}

/** Best single day in the given window. */
export function bestDay(series: DayCount[]): DayCount | null {
  return series.reduce<DayCount | null>((best, d) => (d.count > (best?.count ?? 0) ? d : best), null);
}

/** Weeks × 7 grid (Mon-first columns) for a contribution-style heatmap. */
export function heatmapWeeks(tasks: CompletableTask[], weeks: number, now: Date = new Date()): DayCount[][] {
  const counts = countByDay(tasks);
  const today = startOfDay(now);
  // Align the last column to the current week (Monday start).
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = subDays(today, mondayOffset + (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d);
      const k = dayKey(day);
      return { date: k, label: format(day, "EEE, MMM d"), count: day > today ? -1 : counts.get(k) ?? 0 };
    })
  );
}
