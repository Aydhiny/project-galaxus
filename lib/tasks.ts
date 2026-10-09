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

/** Sort: priority first, then due date (earliest first, undated last), then manual order. */
export function compareTasks(a: TaskLike, b: TaskLike): number {
  const p = PRIORITY_RANK[a.priority as TaskPriority] - PRIORITY_RANK[b.priority as TaskPriority];
  if (p !== 0) return p;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.orderIndex - b.orderIndex;
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
