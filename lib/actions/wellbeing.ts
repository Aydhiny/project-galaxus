"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import {
  addMemoryFor, deleteMemoryFor, holdStatsFor, lateNightsFor, logFocusFor, logUrgeFor, memoriesFor, saveSleepSettingsFor, sleepInsightsFor, sleepSettingsFor, updateMemoryFor,
} from "@/lib/services/wellbeing";

export async function getHoldState() {
  const userId = await requireUserId();
  const [album, stats, sleep, sleepInsights] = await Promise.all([memoriesFor(userId), holdStatsFor(userId), sleepSettingsFor(userId), sleepInsightsFor(userId)]);
  return { album, stats, sleep, sleepInsights };
}
export type HoldState = Awaited<ReturnType<typeof getHoldState>>;

/** Lightweight read for the always-mounted overlays (album ids + sleep times). */
export async function getGuardianState() {
  return toResult(async () => {
    const userId = await requireUserId();
    const [album, sleep, lateNights] = await Promise.all([memoriesFor(userId), sleepSettingsFor(userId), lateNightsFor(userId)]);
    return { album: album.map((m) => ({ id: m.id, year: m.year, caption: m.caption })), sleep, lateNights };
  });
}

export async function addMemory(input: { dataUrl: string; year?: number | null; caption?: string | null }) {
  return toResult(async () => { const id = await addMemoryFor(await requireUserId(), input); revalidatePath("/hold"); return id; });
}
export async function updateMemory(id: number, patch: { year?: number | null; caption?: string | null }) {
  return toResult(async () => { await updateMemoryFor(await requireUserId(), id, patch); revalidatePath("/hold"); });
}
export async function deleteMemory(id: number) {
  return toResult(async () => { await deleteMemoryFor(await requireUserId(), id); revalidatePath("/hold"); });
}
export async function logUrge(outcome: "held" | "slipped", triggers: string[] = []) {
  return toResult(async () => { await logUrgeFor(await requireUserId(), outcome, triggers); revalidatePath("/hold"); });
}
export async function saveSleepSettings(input: { enabled: boolean; bedTime: string; wakeTime: string }) {
  return toResult(async () => { await saveSleepSettingsFor(await requireUserId(), input); revalidatePath("/hold"); });
}
export async function logFocus(minutes: number, label: string | null, completed: boolean) {
  return toResult(async () => logFocusFor(await requireUserId(), minutes, label, completed));
}
