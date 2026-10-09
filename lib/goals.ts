// Pure monthly-goal helpers — shared by the UI, server actions and MCP tools.
// Months are "YYYY-MM" strings and days "YYYY-MM-DD", matching the DB columns.

import { format, getDaysInMonth } from "date-fns";

export const GOAL_STATUSES = ["active", "achieved", "abandoned"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export function isValidMonth(m: unknown): m is string {
  return typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function monthKey(d: Date): string {
  return format(d, "yyyy-MM");
}

/** "2026-10" → "October 2026" */
export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return format(new Date(y, mo - 1, 1), "MMMM yyyy");
}

export function daysInMonth(m: string): number {
  const [y, mo] = m.split("-").map(Number);
  return getDaysInMonth(new Date(y, mo - 1, 1));
}

export function monthBounds(m: string): { start: string; end: string } {
  return { start: `${m}-01`, end: `${m}-${String(daysInMonth(m)).padStart(2, "0")}` };
}

/** Day-of-month → date in that month, clamped to its length (day 31 in Feb → 28/29). */
export function dayInMonth(m: string, day: number): string {
  const d = Math.min(Math.max(1, Math.round(day)), daysInMonth(m));
  return `${m}-${String(d).padStart(2, "0")}`;
}

export function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  return monthKey(new Date(y, mo - 1 + delta, 1));
}

export interface GoalTaskLike {
  status: string;
  phase?: string | null;
  dueDate?: string | null;
  orderIndex?: number;
}

export function goalProgress(tasks: GoalTaskLike[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** How far through the month we are (0–100) — the pace a plan should keep. */
export function expectedPct(m: string, today: string): number {
  const { start, end } = monthBounds(m);
  if (today < start) return 0;
  if (today > end) return 100;
  const day = Number(today.slice(8, 10));
  return Math.round((day / daysInMonth(m)) * 100);
}

export type Pace = "no-plan" | "achieved" | "ahead" | "on-track" | "behind" | "not-started";

/** Compare plan progress with the calendar. ±10 points counts as on track. */
export function goalPace(m: string, today: string, progress: { done: number; total: number; pct: number }): Pace {
  if (progress.total === 0) return "no-plan";
  if (progress.done === progress.total) return "achieved";
  const expected = expectedPct(m, today);
  if (expected === 0) return "not-started";
  const diff = progress.pct - expected;
  if (diff >= 10) return "ahead";
  if (diff >= -10) return "on-track";
  return "behind";
}

export const PACE_LABEL: Record<Pace, string> = {
  "no-plan": "No plan yet",
  achieved: "Plan complete",
  ahead: "Ahead",
  "on-track": "On track",
  behind: "Behind",
  "not-started": "Starts soon",
};

/**
 * Group a goal's tasks into ordered phases. A phase's position follows its
 * earliest due date (then manual order), so "Week 1" naturally comes before
 * "Week 2" even if tasks were added out of order. Unphased tasks go last.
 */
export function groupByPhase<T extends GoalTaskLike>(tasks: T[]): { phase: string | null; tasks: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const t of tasks) {
    const key = t.phase?.trim() || null;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const sortTasks = (a: T, b: T) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  const result = [...groups.entries()].map(([phase, list]) => ({ phase, tasks: [...list].sort(sortTasks) }));
  const firstDate = (g: { tasks: T[] }) => g.tasks[0]?.dueDate ?? "9999";
  return result.sort((a, b) => {
    if (a.phase === null) return 1;
    if (b.phase === null) return -1;
    return firstDate(a).localeCompare(firstDate(b));
  });
}
