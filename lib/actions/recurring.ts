"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import type { RoutineStat } from "@/lib/tasks";
import { rescheduleMissedStepsFor, type RescheduledGoal } from "@/lib/services/goals";
import {
  createRoutineFor, deleteRoutineFor, ensureRoutineInstancesFor, listRoutinesFor, routineStatsFor, updateRoutineFor, type RoutineInput,
} from "@/lib/services/recurring";

function revalidateTaskViews() {
  revalidatePath("/tasks");
  revalidatePath("/productivity");
}

export async function listRecurring() {
  try {
    return await listRoutinesFor(await requireUserId());
  } catch {
    return [];
  }
}

export async function createRecurring(input: RoutineInput) {
  const row = await createRoutineFor(await requireUserId(), input);
  revalidateTaskViews();
  return row;
}

export async function updateRecurring(id: number, patch: Partial<RoutineInput> & { active?: boolean }) {
  await updateRoutineFor(await requireUserId(), id, patch);
  revalidateTaskViews();
}

export async function deleteRecurring(id: number) {
  await deleteRoutineFor(await requireUserId(), id);
  revalidateTaskViews();
}

/** Called by the client on load with the viewer's LOCAL date. */
export async function ensureRecurringInstances(localToday: string): Promise<{
  changed: boolean;
  streaks: Record<number, RoutineStat>;
  rescheduled: RescheduledGoal[];
}> {
  const userId = await requireUserId();
  const { created, archived } = await ensureRoutineInstancesFor(userId, localToday);
  // Same daily pass: goal steps you skipped slide forward instead of piling up.
  const rescheduled = await rescheduleMissedStepsFor(userId, localToday);
  const changed = created > 0 || archived > 0 || rescheduled.length > 0;
  if (changed) {
    revalidateTaskViews();
    revalidatePath("/goal/[id]", "page");
  }
  return { changed, streaks: await routineStatsFor(userId, localToday), rescheduled };
}

/** Streaks for the routines sheet. */
export async function getRoutineStats(localToday: string): Promise<Record<number, RoutineStat>> {
  try {
    return await routineStatsFor(await requireUserId(), localToday);
  } catch {
    return {};
  }
}
