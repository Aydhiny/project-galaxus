"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { isDealStage } from "@/lib/deals";
import { dealsFor, logTheirReplyFor, setDealStageFor, setDealValueFor } from "@/lib/services/deals";

export async function getDeals() {
  return dealsFor(await requireUserId());
}

export async function setDealStage(key: string, stage: string, amountKm?: number | null) {
  return toResult(async () => {
    if (!isDealStage(stage)) throw new Error("Unknown stage.");
    await setDealStageFor(await requireUserId(), key, stage, { amountKm });
    revalidatePath("/deals");
  });
}

export async function setDealValue(key: string, valueKm: number | null) {
  return toResult(async () => { await setDealValueFor(await requireUserId(), key, valueKm); revalidatePath("/deals"); });
}

export async function logTheirReply(key: string, text: string) {
  return toResult(async () => { const r = await logTheirReplyFor(await requireUserId(), key, text); revalidatePath("/deals"); return r; });
}
