"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import {
  deleteProfileFor, queueClaudeScoring, radarFor, saveProfileFor, saveRedditKeyFor, scanGigsFor, setGigNotificationsFor, updateGigFor,
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
