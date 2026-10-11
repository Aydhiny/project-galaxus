"use server";

import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { empireFor } from "@/lib/services/empire";

export async function getEmpire() {
  return toResult(async () => empireFor(await requireUserId()));
}
