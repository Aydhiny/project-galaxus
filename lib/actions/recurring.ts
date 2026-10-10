"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import type { RoutineStat } from "@/lib/tasks";
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
export async function ensureRecurringInstances(localToday: string): Promise<{ changed: boolean; streaks: Record<number, RoutineStat> }> {
  const userId = await requireUserId();
  const { created, archived } = await ensureRoutineInstancesFor(userId, localToday);
  const changed = created > 0 || archived > 0;
  if (changed) revalidateTaskViews();
  return { changed, streaks: await routineStatsFor(userId, localToday) };
}

/** Streaks for the routines sheet. */
export async function getRoutineStats(localToday: string): Promise<Record<number, RoutineStat>> {
  try {
    return await routineStatsFor(await requireUserId(), localToday);
  } catch {
    return {};
  }
}
