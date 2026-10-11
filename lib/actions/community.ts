"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { communitiesFor, scanCommunitiesFor, setCommunityStatusFor } from "@/lib/services/community";

export async function getCommunities() {
  return communitiesFor(await requireUserId());
}
export type CommunityList = Awaited<ReturnType<typeof getCommunities>>;

export async function scanCommunitiesNow() {
  return toResult(async () => {
    const r = await scanCommunitiesFor(await requireUserId(), { maxLookups: 30 });
    revalidatePath("/community");
    return r;
  });
}

export async function setCommunityStatus(id: number, status: "new" | "joined" | "hidden") {
  return toResult(async () => {
    await setCommunityStatusFor(await requireUserId(), id, status);
    revalidatePath("/community");
  });
}
