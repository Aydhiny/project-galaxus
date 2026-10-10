// Routines (recurring task templates) — userId-scoped business logic shared by
// server actions and MCP tools (see lib/services/tasks.ts header).

import { db } from "@/lib/db";
import { recurringTasks, tasks, type RecurringTask } from "@/lib/db/schema";
import { and, asc, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { TASK_PRIORITIES, isValidDaysMask, isValidTime, repeatsOn, routineStreak, toDateKey, type RoutineStat, type TaskPriority } from "@/lib/tasks";
import { subDays } from "date-fns";
import { isArea, type Area } from "@/lib/areas";

const isPriority = (v: unknown): v is TaskPriority => TASK_PRIORITIES.includes(v as TaskPriority);

export interface RoutineInput {
  title: string;
  days: string; // "1111100" Mon→Sun
  time?: string | null;
  priority?: TaskPriority;
  area?: Area | string | null;
}

export async function listRoutinesFor(userId: number): Promise<RecurringTask[]> {
  return db
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.userId, userId))
    .orderBy(asc(recurringTasks.time), asc(recurringTasks.id));
}

export async function createRoutineFor(userId: number, input: RoutineInput): Promise<RecurringTask> {
  const title = String(input.title ?? "").trim().slice(0, 500);
  if (!title) throw new Error("Title is required.");
  if (!isValidDaysMask(input.days)) throw new Error("Days must be 7 characters of 0/1 (Mon→Sun) with at least one day.");
  const [row] = await db
    .insert(recurringTasks)
    .values({
      userId,
      title,
      priority: isPriority(input.priority) ? input.priority : "none",
      days: input.days,
      time: isValidTime(input.time) ? input.time : null,
      area: isArea(input.area) ? input.area : null,
    })
    .returning();
  return row;
}

export async function updateRoutineFor(
  userId: number,
  id: number,
  patch: Partial<RoutineInput> & { active?: boolean }
): Promise<RecurringTask | null> {
  const values: Partial<typeof recurringTasks.$inferInsert> = {};
  if (patch.title !== undefined && String(patch.title).trim()) values.title = String(patch.title).trim().slice(0, 500);
  if (patch.priority !== undefined && isPriority(patch.priority)) values.priority = patch.priority;
  if (patch.days !== undefined && isValidDaysMask(patch.days)) values.days = patch.days;
  if (patch.time !== undefined) values.time = isValidTime(patch.time) ? patch.time : null;
  if (patch.area !== undefined) values.area = isArea(patch.area) ? patch.area : null;
  if (typeof patch.active === "boolean") values.active = patch.active;
  if (Object.keys(values).length === 0) return null;
  const [row] = await db
    .update(recurringTasks)
    .set(values)
    .where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)))
    .returning();
  return row ?? null;
}

/** Deletes the template. Tasks it already created stay (recurring_id → null). */
export async function deleteRoutineFor(userId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(recurringTasks)
    .where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)))
    .returning({ id: recurringTasks.id });
  return rows.length > 0;
}

/**
 * Materialise routine tasks for a LOCAL date. Idempotent via the unique index
 * on (recurring_id, due_date) + ON CONFLICT DO NOTHING; also archives earlier
 * unfinished routine instances so missed days don't pile up as overdue.
 */
export async function ensureRoutineInstancesFor(userId: number, localToday: string): Promise<{ created: number; archived: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localToday)) return { created: 0, archived: 0 };
  // Only dates within a day and a half of the server clock (covers all timezones).
  const drift = Math.abs(new Date(localToday + "T12:00:00Z").getTime() - Date.now());
  if (drift > 38 * 60 * 60 * 1000) return { created: 0, archived: 0 };

  const templates = await db
    .select()
    .from(recurringTasks)
    .where(and(eq(recurringTasks.userId, userId), eq(recurringTasks.active, true)));
  const due = templates.filter((t) => repeatsOn(t.days, localToday));

  let created = 0;
  if (due.length > 0) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${tasks.orderIndex}), 0)::int` })
      .from(tasks)
      .where(eq(tasks.userId, userId));
    const ordered = [...due].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    const inserted = await db
      .insert(tasks)
      .values(
        ordered.map((t, i) => ({
          userId,
          title: t.title,
          priority: t.priority,
          dueDate: localToday,
          dueTime: t.time,
          recurringId: t.id,
          area: t.area,
          orderIndex: max + 1 + i,
        }))
      )
      .onConflictDoNothing({ target: [tasks.recurringId, tasks.dueDate] })
      .returning({ id: tasks.id });
    created = inserted.length;
  }

  const now = new Date();
  const archived = await db
    .update(tasks)
    .set({ deletedAt: now, deletionReviewedAt: now })
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.recurringId),
        isNull(tasks.deletedAt),
        ne(tasks.status, "done"),
        lt(tasks.dueDate, localToday)
      )
    )
    .returning({ id: tasks.id });

  return { created, archived: archived.length };
}

/** Streaks per routine id, computed from a year of completed copies. */
export async function routineStatsFor(userId: number, localToday: string): Promise<Record<number, RoutineStat>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localToday)) return {};
  const templates = await db.select().from(recurringTasks).where(eq(recurringTasks.userId, userId));
  if (templates.length === 0) return {};
  const from = toDateKey(subDays(new Date(localToday + "T12:00:00"), 366));
  // Archived (soft-deleted) copies are misses; only done copies count, and
  // done copies are never archived — so no deletedAt filter is needed.
  const done = await db
    .select({ recurringId: tasks.recurringId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.recurringId), eq(tasks.status, "done"), gte(tasks.dueDate, from)));
  const byRoutine = new Map<number, Set<string>>();
  for (const d of done) {
    if (!d.recurringId || !d.dueDate) continue;
    if (!byRoutine.has(d.recurringId)) byRoutine.set(d.recurringId, new Set());
    byRoutine.get(d.recurringId)!.add(d.dueDate);
  }
  const out: Record<number, RoutineStat> = {};
  for (const t of templates) {
    const since = t.createdAt ? toDateKey(t.createdAt) : from;
    out[t.id] = routineStreak(t.days, byRoutine.get(t.id) ?? new Set(), localToday, since);
  }
  return out;
}