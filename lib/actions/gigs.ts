"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import {
  deleteProfileFor, pruneGigsFor, queueClaudeScoring, resetLearningFor, reviewGigFor, radarFor, saveProfileFor, saveRedditKeyFor, scanGigsFor, setGigNotificationsFor, updateGigFor,
  type ProfilePatch,
} from "@/lib/services/gigs";

const refresh = () => revalidatePath("/gigs");

export async function getRadar() {
  return radarFor(await requireUserId());
}
export type RadarState = Awaited<ReturnType<typeof getRadar>>;

export async function scanGigsNow() {
  return toResult(async () => {
    const userId = await requireUserId();
    const r = await scanGigsFor(userId, { forceBoards: true });
    await pruneGigsFor(userId); // re-apply the quality rules to what's already listed
    await queueClaudeScoring(userId);
    refresh();
    return r;
  });
}

export async function updateGig(id: number, patch: { status?: string; draft?: string }) {
  return toResult(async () => { await updateGigFor(await requireUserId(), id, patch); refresh(); });
}

export async function saveGigProfile(id: number | null, patch: ProfilePatch) {
  return toResult(async () => { const row = await saveProfileFor(await requireUserId(), id, patch); refresh(); return row; });
}

export async function deleteGigProfile(id: number) {
  return toResult(async () => { await deleteProfileFor(await requireUserId(), id); refresh(); });
}

export async function saveRedditKey(input: { clientId: string; clientSecret: string } | null) {
  return toResult(async () => { await saveRedditKeyFor(await requireUserId(), input); refresh(); });
}

export async function setGigNotifications(on: boolean) {
  return toResult(async () => { await setGigNotificationsFor(await requireUserId(), on); refresh(); });
}

export async function reviewGig(id: number, rating: 1 | -1 | 0, reasons: string[] = []) {
  return toResult(async () => { const r = await reviewGigFor(await requireUserId(), id, rating, reasons); refresh(); return r; });
}

export async function resetGigLearning() {
  return toResult(async () => { await resetLearningFor(await requireUserId()); refresh(); });
}
