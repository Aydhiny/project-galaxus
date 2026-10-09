"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import {
  createGoalFor, deleteGoalFor, listGoalsFor, updateGoalFor, type GoalInput,
} from "@/lib/services/goals";
import type { GoalStatus } from "@/lib/goals";

function revalidateGoalViews() {
  revalidatePath("/tasks");
  revalidatePath("/productivity");
  revalidatePath("/review");
  revalidatePath("/goal/[id]", "page");
}

/** Goals for the given months (the UI asks for this month + neighbours). */
export async function listMonthlyGoals(months: string[]) {
  try {
    const userId = await requireUserId();
    const all = await listGoalsFor(userId);
    const wanted = new Set(months);
    return all.filter((g) => wanted.has(g.month));
  } catch {
    return [];
  }
}

export async function createMonthlyGoal(input: GoalInput) {
  const row = await createGoalFor(await requireUserId(), input);
  revalidateGoalViews();
  return row;
}

export async function updateMonthlyGoal(id: number, patch: Partial<GoalInput> & { status?: GoalStatus }) {
  const row = await updateGoalFor(await requireUserId(), id, patch);
  revalidateGoalViews();
  return row;
}

export async function deleteMonthlyGoal(id: number, withTasks: boolean) {
  await deleteGoalFor(await requireUserId(), id, withTasks);
  revalidateGoalViews();
}
