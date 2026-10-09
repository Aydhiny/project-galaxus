// Task business logic, independent of HOW the caller authenticated.
// Server actions pass the session user; the MCP endpoint passes the API-token
// user. Every function takes userId explicitly and scopes all queries by it.
//
// Not a "use server" file on purpose: these take a raw userId, so exposing
// them as server actions would let anyone act as any user.

import { db } from "@/lib/db";
import { monthlyGoals, tasks, type Task } from "@/lib/db/schema";
import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { TASK_PRIORITIES, TASK_STATUSES, isValidTime, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { isArea, type Area } from "@/lib/areas";
import { sanitizeAttachments, type TaskAttachment } from "@/lib/attachments";

export const isStatus = (v: unknown): v is TaskStatus => TASK_STATUSES.includes(v as TaskStatus);
export const isPriority = (v: unknown): v is TaskPriority => TASK_PRIORITIES.includes(v as TaskPriority);
export const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface TaskInput {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  goalId?: number | null;
  phase?: string | null;
  area?: Area | string | null;
  attachments?: TaskAttachment[];
}

export type TaskPatch = Partial<Omit<TaskInput, "title">> & { title?: string };

const MAX_BULK = 150;

/** Throws unless the goal exists and belongs to this user. */
async function assertGoalOwned(userId: number, goalId: number) {
  const [g] = await db
    .select({ id: monthlyGoals.id })
    .from(monthlyGoals)
    .where(and(eq(monthlyGoals.id, goalId), eq(monthlyGoals.userId, userId)))
    .limit(1);
  if (!g) throw new Error("Goal not found.");
}

async function nextOrderIndex(userId: number): Promise<number> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.orderIndex}), 0)::int` })
    .from(tasks)
    .where(eq(tasks.userId, userId));
  return max + 1;
}

/** Validate + normalise one task's fields into insert values. */
function toValues(userId: number, input: TaskInput, orderIndex: number): typeof tasks.$inferInsert {
  const title = String(input.title ?? "").trim().slice(0, 500);
  if (!title) throw new Error("Task title is required.");
  const status = isStatus(input.status) ? input.status : "todo";
  return {
    userId,
    title,
    notes: input.notes ? String(input.notes).slice(0, 20_000) : null,
    dueDate: isDateKey(input.dueDate) ? input.dueDate : null,
    dueTime: isValidTime(input.dueTime) ? input.dueTime : null,
    priority: isPriority(input.priority) ? input.priority : "none",
    status,
    completedAt: status === "done" ? new Date() : null,
    goalId: typeof input.goalId === "number" ? input.goalId : null,
    phase: input.phase ? String(input.phase).trim().slice(0, 100) || null : null,
    area: isArea(input.area) ? input.area : null,
    attachments: sanitizeAttachments(input.attachments),
    orderIndex,
  };
}

export async function listTasksFor(
  userId: number,
  opts: { goalId?: number; from?: string; to?: string; includeDone?: boolean; area?: string } = {}
): Promise<Task[]> {
  const conds = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];
  if (opts.goalId) conds.push(eq(tasks.goalId, opts.goalId));
  if (isArea(opts.area)) conds.push(eq(tasks.area, opts.area));
  if (isDateKey(opts.from)) conds.push(gte(tasks.dueDate, opts.from));
  if (isDateKey(opts.to)) conds.push(lte(tasks.dueDate, opts.to));
  if (opts.includeDone === false) conds.push(ne(tasks.status, "done"));
  return db.select().from(tasks).where(and(...conds)).orderBy(asc(tasks.orderIndex), asc(tasks.id));
}

export async function getTaskFor(userId: number, id: number): Promise<Task | null> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function createTaskFor(userId: number, input: TaskInput): Promise<Task> {
  if (typeof input.goalId === "number") await assertGoalOwned(userId, input.goalId);
  const [row] = await db.insert(tasks).values(toValues(userId, input, await nextOrderIndex(userId))).returning();
  return row;
}

/** Insert many tasks in one statement (used for AI-generated goal plans). */
export async function createTasksFor(userId: number, inputs: TaskInput[]): Promise<Task[]> {
  if (inputs.length === 0) return [];
  if (inputs.length > MAX_BULK) throw new Error(`At most ${MAX_BULK} tasks per request.`);
  const goalIds = [...new Set(inputs.map((i) => i.goalId).filter((g): g is number => typeof g === "number"))];
  for (const g of goalIds) await assertGoalOwned(userId, g);
  const start = await nextOrderIndex(userId);
  return db.insert(tasks).values(inputs.map((input, i) => toValues(userId, input, start + i))).returning();
}

export async function updateTaskFor(userId: number, id: number, patch: TaskPatch): Promise<Task | null> {
  const values: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const t = String(patch.title).trim().slice(0, 500);
    if (t) values.title = t;
  }
  if (patch.notes !== undefined) values.notes = patch.notes ? String(patch.notes).slice(0, 20_000) : null;
  if (patch.priority !== undefined && isPriority(patch.priority)) values.priority = patch.priority;
  if (patch.dueDate !== undefined) values.dueDate = isDateKey(patch.dueDate) ? patch.dueDate : null;
  if (patch.dueTime !== undefined) values.dueTime = isValidTime(patch.dueTime) ? patch.dueTime : null;
  if (patch.phase !== undefined) values.phase = patch.phase ? String(patch.phase).trim().slice(0, 100) || null : null;
  if (patch.area !== undefined) values.area = isArea(patch.area) ? patch.area : null;
  if (patch.attachments !== undefined) values.attachments = sanitizeAttachments(patch.attachments);
  if (patch.goalId !== undefined) {
    if (typeof patch.goalId === "number") await assertGoalOwned(userId, patch.goalId);
    values.goalId = typeof patch.goalId === "number" ? patch.goalId : null;
  }
  if (patch.status !== undefined && isStatus(patch.status)) {
    values.status = patch.status;
    values.completedAt = patch.status === "done" ? new Date() : null;
  }
  const [row] = await db
    .update(tasks)
    .set(values)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .returning();
  return row ?? null;
}

/** Soft delete (history kept; unfinished ones feed the "bring it back?" prompt). */
export async function deleteTaskFor(userId: number, id: number): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .update(tasks)
    .set({
      deletedAt: now,
      deletionReviewedAt: sql`case when ${tasks.status} = 'done' then ${now.toISOString()}::timestamp else null end`,
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id });
  return rows.length > 0;
}
