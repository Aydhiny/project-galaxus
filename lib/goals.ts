// Pure monthly-goal helpers — shared by the UI, server actions and MCP tools.
// Months are "YYYY-MM" strings and days "YYYY-MM-DD", matching the DB columns.

import { addDays, differenceInCalendarDays, format, getDaysInMonth } from "date-fns";

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

/**
 * Share of the plan scheduled BEFORE today (0–100) — the honest yardstick for
 * a dated plan. Today's steps don't count yet: you're not behind on something
 * you still have the rest of the day to do, and a plan starting on the 10th
 * isn't "behind" on the 9th just because 29% of the month has passed.
 */
export function scheduledPct(tasks: GoalTaskLike[], today: string): number | null {
  const dated = tasks.filter((t) => t.dueDate);
  if (dated.length === 0) return null;
  return Math.round((dated.filter((t) => t.dueDate! < today).length / tasks.length) * 100);
}

/** Expected progress by today: the plan's own schedule, else the calendar. */
export function expectedProgress(m: string, today: string, tasks?: GoalTaskLike[]): number {
  return (tasks && scheduledPct(tasks, today)) ?? expectedPct(m, today);
}

export type Pace = "no-plan" | "achieved" | "ahead" | "on-track" | "behind" | "not-started";

/** Compare plan progress with where it should be today. ±10 points counts as on track. */
export function goalPace(
  m: string,
  today: string,
  progress: { done: number; total: number; pct: number },
  tasks?: GoalTaskLike[]
): Pace {
  if (progress.total === 0) return "no-plan";
  if (progress.done === progress.total) return "achieved";
  const expected = expectedProgress(m, today, tasks);
  if (expected === 0) {
    // Nothing was due before today: on track if the plan has begun (a step
    // today or something already done), otherwise it simply hasn't started.
    return progress.done > 0 || tasks?.some((t) => t.dueDate === today) ? "on-track" : "not-started";
  }
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

/**
 * What matters TODAY in a plan: steps due today (done or not) plus earlier
 * steps still open — missed steps stay visible instead of silently vanishing.
 */
export function todaysSteps<T extends GoalTaskLike & { id: number }>(tasks: T[], today: string): T[] {
  return tasks
    .filter((t) => t.dueDate === today || (t.status !== "done" && !!t.dueDate && t.dueDate < today))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/** The first open step after today (for "Nothing today — next: …"). */
export function nextStep<T extends GoalTaskLike>(tasks: T[], today: string): T | null {
  return (
    tasks
      .filter((t) => t.status !== "done" && !!t.dueDate && t.dueDate > today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0] ?? null
  );
}

/**
 * Skipped a day? Slide the plan instead of piling up overdue steps.
 * The earliest missed open step moves to today and every later open step
 * moves by the same number of days — order and spacing stay intact.
 *
 * Steps never leave the goal's month: if sliding would pass `monthEnd`, the
 * moving steps are spread evenly over the days that are left instead
 * (`packed: true`). After the month is over nothing moves.
 * Done steps never move. Returns only the steps whose date changes.
 */
export function shiftMissedSteps(
  steps: { id: number; dueDate: string | null; status: string }[],
  today: string,
  monthEnd?: string
): { moves: { id: number; dueDate: string; from: string }[]; packed: boolean } {
  const none = { moves: [], packed: false };
  if (monthEnd && today > monthEnd) return none;
  const open = steps.filter((t) => t.status !== "done" && !!t.dueDate);
  const missed = open.filter((t) => t.dueDate! < today).map((t) => t.dueDate!).sort();
  if (missed.length === 0) return none;
  const earliest = missed[0];
  const at = (d: string) => new Date(d + "T12:00:00");
  const key = (d: Date) => format(d, "yyyy-MM-dd");
  const days = differenceInCalendarDays(at(today), at(earliest));
  if (days <= 0) return none;

  const moving = open
    .filter((t) => t.dueDate! >= earliest)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.id - b.id);
  const shifted = moving.map((t) => ({ id: t.id, from: t.dueDate!, dueDate: key(addDays(at(t.dueDate!), days)) }));
  if (!monthEnd || shifted.every((m) => m.dueDate <= monthEnd)) return { moves: shifted, packed: false };

  // Not enough month left at the old spacing: spread evenly over today…monthEnd.
  const left = differenceInCalendarDays(at(monthEnd), at(today)) + 1;
  const moves = moving
    .map((t, i) => ({ id: t.id, from: t.dueDate!, dueDate: key(addDays(at(today), Math.floor((i * left) / moving.length))) }))
    .filter((m) => m.dueDate !== m.from);
  return { moves, packed: true };
}

/**
 * More open steps left than days left in the month → "final stretch".
 * Returns null while there's at most one step per remaining day.
 */
export function finalStretch(
  steps: { dueDate: string | null; status: string }[],
  today: string,
  month: string
): { steps: number; days: number } | null {
  const end = monthBounds(month).end;
  if (today > end || today.slice(0, 7) !== month) return null;
  const open = steps.filter((t) => t.status !== "done" && !!t.dueDate && t.dueDate >= today && t.dueDate <= end).length;
  const days = differenceInCalendarDays(new Date(end + "T12:00:00"), new Date(today + "T12:00:00")) + 1;
  return open > days ? { steps: open, days } : null;
}
