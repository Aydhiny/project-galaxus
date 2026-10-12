"use server";

import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { activityStatusFor, beatsFromFilesFor, logActivityFor, logPrayerFor, logPresenceFor } from "@/lib/services/activity";

/** Desktop app batch → stored minutes; returns the live status (doomscroll guard, deep work today). */
export async function logActivity(samples: { minute: number; app: string; site?: string | null; secs: number }[]) {
  return toResult(async () => {
    const userId = await requireUserId();
    await logActivityFor(userId, Array.isArray(samples) ? samples : []);
    return activityStatusFor(userId);
  });
}

export async function logPresence() {
  return toResult(async () => { await logPresenceFor(await requireUserId()); });
}

export async function getActivityStatus() {
  return toResult(async () => activityStatusFor(await requireUserId()));
}

export async function addBeatsFromFiles(files: { name: string; modifiedMs: number }[]) {
  return toResult(async () => beatsFromFilesFor(await requireUserId(), Array.isArray(files) ? files : []));
}

export async function logPrayer(prayer: string) {
  return toResult(async () => logPrayerFor(await requireUserId(), prayer));
}
