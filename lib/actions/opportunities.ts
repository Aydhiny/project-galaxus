"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { addOpportunityTaskFor, opportunitiesFor, scanOpportunitiesFor, setOpportunityStatusFor } from "@/lib/services/opportunities";

export async function getOpportunities() {
  return opportunitiesFor(await requireUserId());
}
export type OpportunityList = Awaited<ReturnType<typeof getOpportunities>>;

export async function scanOpportunitiesNow() {
  return toResult(async () => {
    const r = await scanOpportunitiesFor(await requireUserId());
    revalidatePath("/opportunities");
    return r;
  });
}

export async function addOpportunityTask(id: number) {
  return toResult(async () => {
    const r = await addOpportunityTaskFor(await requireUserId(), id);
    revalidatePath("/opportunities"); revalidatePath("/tasks");
    return r;
  });
}

export async function setOpportunityStatus(id: number, status: "new" | "saved" | "hidden") {
  return toResult(async () => { await setOpportunityStatusFor(await requireUserId(), id, status); revalidatePath("/opportunities"); });
}
