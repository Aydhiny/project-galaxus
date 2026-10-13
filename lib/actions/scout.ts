"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { saveScoutSettingsFor, scanScoutFor, scoutOverviewFor, setScoutMarkFor } from "@/lib/services/scout";

export async function getScout() {
  return scoutOverviewFor(await requireUserId());
}
export type ScoutOverview = Awaited<ReturnType<typeof getScout>>;

export async function scanScoutNow() {
  return toResult(async () => {
    const r = await scanScoutFor(await requireUserId());
    revalidatePath("/scout");
    return r;
  });
}

export async function setScoutMark(id: number, mark: "new" | "saved" | "hidden") {
  return toResult(async () => { await setScoutMarkFor(await requireUserId(), id, mark); revalidatePath("/scout"); });
}

export async function saveScoutSettings(patch: { profile?: string; subs?: string }) {
  return toResult(async () => { await saveScoutSettingsFor(await requireUserId(), patch); revalidatePath("/scout"); });
}
