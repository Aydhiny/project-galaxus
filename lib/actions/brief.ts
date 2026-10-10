"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import { digestFor, ensureTodayDigestFor, setBriefNotificationsFor } from "@/lib/services/digest";

export async function getBrief(day?: string) {
  return digestFor(await requireUserId(), day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined);
}
export type BriefState = Awaited<ReturnType<typeof getBrief>>;

/** "Get today's brief now" — builds it immediately (before 06:00 too). */
export async function buildBriefNow() {
  return toResult(async () => {
    const userId = await requireUserId();
    const { digest } = await digestFor(userId);
    const today = await ensureTodayDigestFor(userId, { force: !digest || String(digest.day) !== new Date().toISOString().slice(0, 10) });
    revalidatePath("/brief");
    return { day: today ? String(today.day) : null, stories: today?.items.length ?? 0 };
  });
}

export async function setBriefNotifications(on: boolean) {
  return toResult(async () => {
    await setBriefNotificationsFor(await requireUserId(), on);
    revalidatePath("/brief");
  });
}
