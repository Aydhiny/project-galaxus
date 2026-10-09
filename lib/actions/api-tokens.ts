"use server";

import { requireUserId } from "@/lib/auth-session";
import { createApiTokenFor, listApiTokensFor, revokeApiTokenFor } from "@/lib/services/api-tokens";

export async function listApiTokens() {
  try {
    return await listApiTokensFor(await requireUserId());
  } catch {
    return [];
  }
}

/** Returns the raw token ONCE — it can never be shown again. */
export async function createApiToken(name: string) {
  return createApiTokenFor(await requireUserId(), name);
}

export async function revokeApiToken(id: number) {
  return revokeApiTokenFor(await requireUserId(), id);
}
