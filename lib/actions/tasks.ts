"use server";

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/tasks";

const isStatus = (v: unknown): v is TaskStatus => TASK_STATUSES.includes(v as TaskStatus);
const isPriority = (v: unknown): v is TaskPriority => TASK_PRIORITIES.includes(v as TaskPriority);
const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function listTasks() {
  try {
    const userId = await requireUserId();
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(asc(tasks.orderIndex), asc(tasks.id));
  } catch {
    return [];
  }
}

export async function createTask(input: {
  title: string;
  dueDate?: string | null;
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
      priority: isPriority(input.priority) ? input.priority : "none",
      status,
      completedAt: status === "done" ? new Date() : null,
      orderIndex: max + 1,
    })
    .returning();

  revalidatePath("/tasks");
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
  if (patch.status !== undefined && isStatus(patch.status)) {
    values.status = patch.status;
    values.completedAt = patch.status === "done" ? new Date() : null;
  }

  await db.update(tasks).set(values).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidatePath("/tasks");
}

export async function deleteTask(id: number) {
  const userId = await requireUserId();
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidatePath("/tasks");
}

export async function clearCompletedTasks() {
  const userId = await requireUserId();
  await db.delete(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "done")));
  revalidatePath("/tasks");
}
