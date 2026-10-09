"use server";

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { TASK_PRIORITIES, TASK_STATUSES, isValidTime, type TaskPriority, type TaskStatus } from "@/lib/tasks";

const isStatus = (v: unknown): v is TaskStatus => TASK_STATUSES.includes(v as TaskStatus);
const isPriority = (v: unknown): v is TaskPriority => TASK_PRIORITIES.includes(v as TaskPriority);
const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function revalidateTaskViews() {
  revalidatePath("/tasks");
  revalidatePath("/productivity");
  revalidatePath("/review");
}

/** Sanitise a client-supplied id list (server actions are public endpoints). */
function cleanIds(ids: unknown, max = 500): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is number => Number.isInteger(x) && x > 0))].slice(0, max);
}

/** Live (not removed) tasks — what the Tasks/Productivity screens show. */
export async function listTasks() {
  try {
    const userId = await requireUserId();
    return await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.orderIndex), asc(tasks.id));
  } catch {
    return [];
  }
}

/**
 * Every completed task, INCLUDING ones later removed/cleared — history is
 * kept so stats and points don't silently shrink when you tidy up.
 */
export async function listCompletionHistory() {
  try {
    const userId = await requireUserId();
    return await db
      .select({
        id: tasks.id,
        status: tasks.status,
        priority: tasks.priority,
        completedAt: tasks.completedAt,
        restoredAt: tasks.restoredAt,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "done"), isNotNull(tasks.completedAt)));
  } catch {
    return [];
  }
}

/** All tasks touched in the last `days` days, removed ones included (weekly review). */
export async function listTaskHistory(days = 70) {
  try {
    const userId = await requireUserId();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceKey = since.toISOString().slice(0, 10);
    return await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(
            gte(tasks.createdAt, since),
            gte(tasks.completedAt, since),
            gte(tasks.deletedAt, since),
            gte(tasks.dueDate, sinceKey)
          )
        )
      );
  } catch {
    return [];
  }
}

export async function createTask(input: {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
}) {
  const userId = await requireUserId();
  const title = input.title.trim().slice(0, 500);
  if (!title) throw new Error("Task title is required.");

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.orderIndex}), 0)::int` })
    .from(tasks)
    .where(eq(tasks.userId, userId));

  const status = isStatus(input.status) ? input.status : "todo";
  const [row] = await db
    .insert(tasks)
    .values({
      userId,
      title,
      dueDate: isDateKey(input.dueDate) ? input.dueDate : null,
      dueTime: isValidTime(input.dueTime) ? input.dueTime : null,
      priority: isPriority(input.priority) ? input.priority : "none",
      status,
      completedAt: status === "done" ? new Date() : null,
      orderIndex: max + 1,
    })
    .returning();

  revalidateTaskViews();
  return row;
}

export async function updateTask(
  id: number,
  patch: {
    title?: string;
    notes?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
    dueTime?: string | null;
  }
) {
  const userId = await requireUserId();
  const values: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };

  if (patch.title !== undefined) {
    const t = patch.title.trim().slice(0, 500);
    if (t) values.title = t;
  }
  if (patch.notes !== undefined) values.notes = patch.notes ? patch.notes.slice(0, 20_000) : null;
  if (patch.priority !== undefined && isPriority(patch.priority)) values.priority = patch.priority;
  if (patch.dueDate !== undefined) values.dueDate = isDateKey(patch.dueDate) ? patch.dueDate : null;
  if (patch.dueTime !== undefined) values.dueTime = isValidTime(patch.dueTime) ? patch.dueTime : null;
  if (patch.status !== undefined && isStatus(patch.status)) {
    values.status = patch.status;
    values.completedAt = patch.status === "done" ? new Date() : null;
  }

  await db.update(tasks).set(values).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidateTaskViews();
}

/**
 * Persist a new manual order: `ids` is a section's tasks top-to-bottom.
 * One UPDATE with a CASE expression instead of N round trips.
 */
export async function reorderTasks(ids: number[]) {
  const userId = await requireUserId();
  const clean = cleanIds(ids);
  if (clean.length === 0) return;
  const cases = sql.join(clean.map((id, i) => sql`when ${id}::int then ${i}::int`), sql` `);
  await db
    .update(tasks)
    .set({ orderIndex: sql`case ${tasks.id} ${cases} else ${tasks.orderIndex} end` })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, clean)));
  revalidateTaskViews();
}

/**
 * Soft delete. The row (and its history) stays; unfinished removed tasks are
 * offered back the next day by the "bring it back?" prompt. Completed tasks
 * are marked reviewed straight away — there's nothing to feel guilty about.
 */
export async function deleteTask(id: number) {
  const userId = await requireUserId();
  const now = new Date();
  await db
    .update(tasks)
    .set({
      deletedAt: now,
      deletionReviewedAt: sql`case when ${tasks.status} = 'done' then ${now.toISOString()}::timestamp else null end`,
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidateTaskViews();
}

export async function clearCompletedTasks() {
  const userId = await requireUserId();
  const now = new Date();
  await db
    .update(tasks)
    .set({ deletedAt: now, deletionReviewedAt: now })
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "done"), isNull(tasks.deletedAt)));
  revalidateTaskViews();
}

/** Unfinished tasks removed in the last week that haven't been answered yet. */
export async function getRemovedForReview() {
  try {
    const userId = await requireUserId();
    const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    return await db
      .select({ id: tasks.id, title: tasks.title, priority: tasks.priority, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNotNull(tasks.deletedAt),
          isNull(tasks.deletionReviewedAt),
          ne(tasks.status, "done"),
          gte(tasks.deletedAt, weekAgo)
        )
      )
      .orderBy(asc(tasks.deletedAt));
  } catch {
    return [];
  }
}

/** Bring removed tasks back, due on `dueDate`, flagged for double points. */
export async function restoreTasks(ids: number[], dueDate: string) {
  const userId = await requireUserId();
  const clean = cleanIds(ids);
  if (clean.length === 0) return;
  const now = new Date();
  await db
    .update(tasks)
    .set({
      deletedAt: null,
      deletionReviewedAt: now,
      restoredAt: now,
      status: "todo",
      completedAt: null,
      dueDate: isDateKey(dueDate) ? dueDate : null,
    })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, clean), isNotNull(tasks.deletedAt)));
  revalidateTaskViews();
}

/** "Let it go" — stays in history, never asked about again. */
export async function dismissRemovedTasks(ids: number[]) {
  const userId = await requireUserId();
  const clean = cleanIds(ids);
  if (clean.length === 0) return;
  await db
    .update(tasks)
    .set({ deletionReviewedAt: new Date() })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, clean)));
}
