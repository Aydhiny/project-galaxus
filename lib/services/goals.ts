// Monthly-goal business logic (userId-scoped; see lib/services/tasks.ts header).

import { db } from "@/lib/db";
import { monthlyGoals, tasks, type MonthlyGoal, type Task } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { GOAL_STATUSES, dayInMonth, daysInMonth, goalProgress, isValidMonth, type GoalStatus } from "@/lib/goals";
import { createTasksFor, isDateKey, type TaskInput } from "@/lib/services/tasks";
import type { TaskPriority } from "@/lib/tasks";

const isGoalStatus = (v: unknown): v is GoalStatus => GOAL_STATUSES.includes(v as GoalStatus);

export interface GoalInput {
  title: string;
  month: string;
  emoji?: string | null;
  description?: string | null;
}

export async function listGoalsFor(
  userId: number,
  opts: { month?: string; status?: GoalStatus } = {}
): Promise<MonthlyGoal[]> {
  const conds = [eq(monthlyGoals.userId, userId)];
  if (isValidMonth(opts.month)) conds.push(eq(monthlyGoals.month, opts.month));
  if (isGoalStatus(opts.status)) conds.push(eq(monthlyGoals.status, opts.status));
  return db.select().from(monthlyGoals).where(and(...conds)).orderBy(desc(monthlyGoals.month), asc(monthlyGoals.id));
}

export async function getGoalFor(userId: number, id: number): Promise<MonthlyGoal | null> {
  const [g] = await db
    .select()
    .from(monthlyGoals)
    .where(and(eq(monthlyGoals.id, id), eq(monthlyGoals.userId, userId)))
    .limit(1);
  return g ?? null;
}

export async function createGoalFor(userId: number, input: GoalInput): Promise<MonthlyGoal> {
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) throw new Error("Goal title is required.");
  if (!isValidMonth(input.month)) throw new Error("Month must look like YYYY-MM.");
  const [row] = await db
    .insert(monthlyGoals)
    .values({
      userId,
      title,
      month: input.month,
      emoji: input.emoji ? String(input.emoji).slice(0, 16) : null,
      description: input.description ? String(input.description).slice(0, 5_000) : null,
    })
    .returning();
  return row;
}

export async function updateGoalFor(
  userId: number,
  id: number,
  patch: Partial<GoalInput> & { status?: GoalStatus }
): Promise<MonthlyGoal | null> {
  const values: Partial<typeof monthlyGoals.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined && String(patch.title).trim()) values.title = String(patch.title).trim().slice(0, 200);
  if (patch.month !== undefined && isValidMonth(patch.month)) values.month = patch.month;
  if (patch.emoji !== undefined) values.emoji = patch.emoji ? String(patch.emoji).slice(0, 16) : null;
  if (patch.description !== undefined) values.description = patch.description ? String(patch.description).slice(0, 5_000) : null;
  if (patch.status !== undefined && isGoalStatus(patch.status)) values.status = patch.status;
  const [row] = await db
    .update(monthlyGoals)
    .set(values)
    .where(and(eq(monthlyGoals.id, id), eq(monthlyGoals.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Delete a goal. Its tasks are kept (goal_id → null via FK) unless
 * `withTasks` — then unfinished tasks are soft-deleted too, as already
 * reviewed (deleting a whole plan isn't "giving up on a task").
 */
export async function deleteGoalFor(userId: number, id: number, withTasks = false): Promise<boolean> {
  if (withTasks) {
    const now = new Date();
    await db
      .update(tasks)
      .set({ deletedAt: now, deletionReviewedAt: now })
      .where(and(eq(tasks.userId, userId), eq(tasks.goalId, id), isNull(tasks.deletedAt)));
  }
  const rows = await db
    .delete(monthlyGoals)
    .where(and(eq(monthlyGoals.id, id), eq(monthlyGoals.userId, userId)))
    .returning({ id: monthlyGoals.id });
  return rows.length > 0;
}

export async function goalsWithProgressFor(userId: number, opts: { month?: string; status?: GoalStatus } = {}) {
  const goals = await listGoalsFor(userId, opts);
  if (goals.length === 0) return [];
  const goalTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), inArray(tasks.goalId, goals.map((g) => g.id))));
  return goals.map((g) => {
    const mine = goalTasks.filter((t) => t.goalId === g.id);
    return { ...g, progress: goalProgress(mine), tasks: mine };
  });
}

// ─── Plans (the MCP "create a plan from beginner to pro" flow) ────────────────

export interface PlanTaskInput {
  title: string;
  /** Day of the goal's month (1–31). Ignored if `date` is given. */
  day?: number;
  /** Exact date "YYYY-MM-DD". */
  date?: string;
  notes?: string;
  priority?: TaskPriority;
  time?: string;
}

export interface PlanPhaseInput {
  name: string;
  tasks: PlanTaskInput[];
}

export const MAX_PLAN_TASKS = 120;

/**
 * Resolve each task's due date. Explicit dates win, then day-of-month; tasks
 * with neither are spread evenly across the month in plan order, so a
 * 20-step plan becomes a steady progression from day 1 to the last day.
 */
export function schedulePlan(month: string, phases: PlanPhaseInput[]): { phase: string; task: PlanTaskInput; dueDate: string }[] {
  const flat = phases.flatMap((p) => p.tasks.map((task) => ({ phase: p.name.trim().slice(0, 100), task })));
  const days = daysInMonth(month);
  const n = flat.length;
  return flat.map(({ phase, task }, i) => {
    let dueDate: string;
    if (isDateKey(task.date)) dueDate = task.date;
    else if (typeof task.day === "number") dueDate = dayInMonth(month, task.day);
    else dueDate = dayInMonth(month, n <= 1 ? 1 : 1 + Math.round((i * (days - 1)) / (n - 1)));
    return { phase, task, dueDate };
  });
}

/** Create a goal (or extend an existing one) with a phased, dated task plan. */
export async function createGoalPlanFor(
  userId: number,
  input: { goal: GoalInput; phases: PlanPhaseInput[] } | { goalId: number; phases: PlanPhaseInput[] }
): Promise<{ goal: MonthlyGoal; tasks: Task[] }> {
  const total = input.phases.reduce((s, p) => s + p.tasks.length, 0);
  if (total === 0) throw new Error("A plan needs at least one task.");
  if (total > MAX_PLAN_TASKS) throw new Error(`Keep plans to ${MAX_PLAN_TASKS} tasks or fewer.`);

  const goal = "goalId" in input ? await getGoalFor(userId, input.goalId) : await createGoalFor(userId, input.goal);
  if (!goal) throw new Error("Goal not found.");

  const scheduled = schedulePlan(goal.month, input.phases);
  const rows: TaskInput[] = scheduled.map(({ phase, task, dueDate }) => ({
    title: task.title,
    notes: task.notes ?? null,
    priority: task.priority,
    dueTime: task.time ?? null,
    dueDate,
    goalId: goal.id,
    phase: phase || null,
  }));
  const created = await createTasksFor(userId, rows);
  return { goal, tasks: created };
}
