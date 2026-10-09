// Pure task helpers — grouping by due date and parsing the quick-add box.
// Dates are plain "yyyy-MM-dd" strings (same as the `date` column) so we never
// get bitten by timezone shifts from round-tripping through Date objects.

import { addDays, format, nextDay, type Day } from "date-fns";

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };

export interface TaskLike {
  id: number;
  status: string;
  priority: string;
  dueDate: string | null;
  orderIndex: number;
}

export type DueBucket = "overdue" | "today" | "upcoming" | "later" | "done";

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Next 7 days",
  later: "Later",
  done: "Completed",
};

export function toDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function bucketFor(task: TaskLike, today: string): DueBucket {
  if (task.status === "done") return "done";
  if (!task.dueDate) return "later";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  const weekOut = toDateKey(addDays(new Date(today + "T00:00:00"), 7));
  return task.dueDate <= weekOut ? "upcoming" : "later";
}

/**
 * Sort: YOUR manual order first (drag / move up-down), then id as a stable
 * tiebreak. Priority used to win here, which meant reordering did nothing for
 * tasks of different priority — priority is still shown as a flag instead.
 */
export function compareTasks(a: TaskLike, b: TaskLike): number {
  return a.orderIndex - b.orderIndex || a.id - b.id;
}

/** Old priority-first ordering — still handy for "what's most important" lists. */
export function compareByPriority(a: TaskLike, b: TaskLike): number {
  const p = PRIORITY_RANK[a.priority as TaskPriority] - PRIORITY_RANK[b.priority as TaskPriority];
  return p !== 0 ? p : compareTasks(a, b);
}

export function groupByBucket<T extends TaskLike>(list: T[], today: string): Record<DueBucket, T[]> {
  const groups: Record<DueBucket, T[]> = { overdue: [], today: [], upcoming: [], later: [], done: [] };
  for (const t of list) groups[bucketFor(t, today)].push(t);
  for (const k of Object.keys(groups) as DueBucket[]) {
    groups[k].sort(k === "done" ? (a, b) => b.orderIndex - a.orderIndex : compareTasks);
  }
  return groups;
}

const WEEKDAYS: Record<string, Day> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

/**
 * Quick-add parser: "Call mom tomorrow !high" →
 * { title: "Call mom", dueDate: <tomorrow>, priority: "high" }.
 * Only the tokens it recognises are stripped; everything else stays in the title.
 */
export function parseQuickAdd(input: string, now: Date = new Date()): {
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
} {
  let dueDate: string | null = null;
  let priority: TaskPriority = "none";
  const kept: string[] = [];

  for (const token of input.trim().split(/\s+/)) {
    const t = token.toLowerCase();
    if (t === "!high" || t === "!!!" || t === "!h") priority = "high";
    else if (t === "!medium" || t === "!med" || t === "!!" || t === "!m") priority = "medium";
    else if (t === "!low" || t === "!l") priority = "low";
    else if (t === "today" || t === "tod") dueDate = toDateKey(now);
    else if (t === "tomorrow" || t === "tmr" || t === "tom") dueDate = toDateKey(addDays(now, 1));
    else if (t === "nextweek") dueDate = toDateKey(addDays(now, 7));
    else if (t in WEEKDAYS) dueDate = toDateKey(nextDay(now, WEEKDAYS[t]));
    else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) dueDate = t;
    else kept.push(token);
  }

  return { title: kept.join(" "), dueDate, priority };
}

// ─── Reordering ─────────────────────────────────────────────────────────────

/** Move one id up (-1) or down (+1) within an ordered list. Returns a new array. */
export function moveInList<T>(ids: T[], id: T, dir: -1 | 1): T[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Drag-and-drop: move `fromId` to just above/below `toId`. Returns a new array. */
export function moveTo<T>(ids: T[], fromId: T, toId: T, position: "above" | "below"): T[] {
  if (fromId === toId) return ids;
  const without = ids.filter((x) => x !== fromId);
  const at = without.indexOf(toId);
  if (at === -1) return ids;
  without.splice(position === "above" ? at : at + 1, 0, fromId);
  return without;
}

// ─── Points ─────────────────────────────────────────────────────────────────

export const PRIORITY_POINTS: Record<TaskPriority, number> = { none: 1, low: 2, medium: 3, high: 5 };

/** Points a task is worth when completed. Brought back after removal → double. */
export function taskPoints(t: { priority: string; restoredAt?: Date | string | null }): number {
  const base = PRIORITY_POINTS[t.priority as TaskPriority] ?? 1;
  return t.restoredAt ? base * 2 : base;
}

// ─── Recurrence ─────────────────────────────────────────────────────────────
// Days are a 7-char mask, Monday first: "1111100" = weekdays.

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function isValidDaysMask(days: unknown): days is string {
  return typeof days === "string" && /^[01]{7}$/.test(days) && days.includes("1");
}

export function isValidTime(t: unknown): t is string {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** Does a recurrence mask include this calendar date ("yyyy-MM-dd")? */
export function repeatsOn(days: string, dateKey: string): boolean {
  const d = new Date(dateKey + "T12:00:00");
  return days[(d.getDay() + 6) % 7] === "1";
}

export function describeDays(days: string): string {
  if (days === "1111111") return "Every day";
  if (days === "1111100") return "Weekdays";
  if (days === "0000011") return "Weekends";
  return WEEKDAY_SHORT.filter((_, i) => days[i] === "1").join(", ");
}

/** "08:00" → "8:00 AM" style label respecting the browser locale. */
export function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
