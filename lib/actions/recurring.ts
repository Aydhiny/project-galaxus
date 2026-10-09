"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import {
  createRoutineFor, deleteRoutineFor, ensureRoutineInstancesFor, listRoutinesFor, updateRoutineFor, type RoutineInput,
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
export async function ensureRecurringInstances(localToday: string): Promise<{ changed: boolean }> {
  const { created, archived } = await ensureRoutineInstancesFor(await requireUserId(), localToday);
  const changed = created > 0 || archived > 0;
  if (changed) revalidateTaskViews();
  return { changed };
}
