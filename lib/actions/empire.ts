"use server";

import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { empireFor } from "@/lib/services/empire";
import { empireSharingFor, publicEmpireFor, saveEmpireSharingFor, saveEmpireStyleFor, worldListFor } from "@/lib/services/empire-social";

export async function saveEmpireStyle(style: { palette: string; ground: string; flag: string }) {
  return toResult(async () => saveEmpireStyleFor(await requireUserId(), style));
}
import { interiorFor } from "@/lib/services/empire-extras";

export async function getInterior(buildingId: string) {
  return toResult(async () => interiorFor(await requireUserId(), String(buildingId).slice(0, 20)));
}

export async function getEmpire() {
  return toResult(async () => empireFor(await requireUserId()));
}

export async function getEmpireWorld() {
  const userId = await requireUserId();
  const [cities, sharing] = await Promise.all([worldListFor(userId), empireSharingFor(userId)]);
  return { cities, sharing, viewerId: userId };
}

export async function getPublicEmpire(userId: number) {
  return toResult(async () => publicEmpireFor(await requireUserId(), userId));
}

export async function saveEmpireSharing(input: { isPublic: boolean; cityName: string | null }) {
  return toResult(async () => { await saveEmpireSharingFor(await requireUserId(), input); revalidatePath("/empire/world"); });
}
