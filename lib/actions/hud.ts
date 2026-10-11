"use server";

import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { hudFor } from "@/lib/services/hud";

export async function getHud() {
  return toResult(async () => hudFor(await requireUserId()));
}
