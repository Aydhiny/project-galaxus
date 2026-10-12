"use server";

import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { createShortsWorkerTokenFor, deleteShortJobFor, retryShortJobFor, shortJobsFor } from "@/lib/services/shorts";

export async function getShortJobs() {
  return toResult(async () => shortJobsFor(await requireUserId()));
}
export type ShortJobsState = Awaited<ReturnType<typeof shortJobsFor>>;

export async function createShortsWorkerToken() {
  return toResult(async () => createShortsWorkerTokenFor(await requireUserId()));
}

export async function retryShortJob(id: number) {
  return toResult(async () => retryShortJobFor(await requireUserId(), id));
}

export async function deleteShortJob(id: number) {
  return toResult(async () => deleteShortJobFor(await requireUserId(), id));
}
