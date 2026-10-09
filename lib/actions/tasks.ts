"use server";

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { isDateKey, listTasksFor, createTaskFor, updateTaskFor, deleteTaskFor, type TaskInput, type TaskPatch } from "@/lib/services/tasks";

function revalidateTaskViews() {
  revalidatePath("/tasks");
  revalidatePath("/productivity");
  revalidatePath("/review");
  revalidatePath("/goal/[id]", "page");
}

/** Sanitise a client-supplied id list (server actions are public endpoints). */
function cleanIds(ids: unknown, max = 500): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is number => Number.isInteger(x) && x > 0))].slice(0, max);
}

/** Live (not removed) tasks — what the Tasks/Productivity screens show. */
export async function listTasks() {
  try {
    return await listTasksFor(await requireUserId());
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

export async function createTask(input: TaskInput) {
  const row = await createTaskFor(await requireUserId(), input);
  revalidateTaskViews();
  return row;
}

export async function updateTask(id: number, patch: TaskPatch) {
  await updateTaskFor(await requireUserId(), id, patch);
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
  await deleteTaskFor(await requireUserId(), id);
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
