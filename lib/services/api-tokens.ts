// Personal API tokens for MCP clients / integrations.
// Format: "glx_" + 32 random bytes (base64url). Only the SHA-256 hash is
// stored — a DB leak doesn't leak usable tokens — and the raw value is shown
// to the user exactly once, at creation.

import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

const PREFIX = "glx_";
const MAX_ACTIVE = 10;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createApiTokenFor(userId: number, name: string) {
  const label = String(name ?? "").trim().slice(0, 100) || "MCP client";
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
  if (count >= MAX_ACTIVE) throw new Error(`You can have up to ${MAX_ACTIVE} active tokens. Revoke one first.`);

  const raw = PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: label, tokenHash: hashApiToken(raw), prefix: raw.slice(0, 10) })
    .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt });
  return { token: raw, row };
}

export async function listApiTokensFor(userId: number) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiTokenFor(userId: number, id: number): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

/** Resolve a raw bearer token to its user, or null if unknown/revoked. */
export type TokenScope = "full" | "voice" | "game";

export async function verifyApiToken(raw: string | undefined): Promise<{ userId: number; tokenId: number; scope: TokenScope } | null> {
  if (!raw || !raw.startsWith(PREFIX) || raw.length > 100) return null;
  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId, scope: apiTokens.scope })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashApiToken(raw)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;

  // Record usage, at most every few minutes (avoids a write per tool call).
  const cutoff = new Date(Date.now() - LAST_USED_THROTTLE_MS);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiTokens.id, row.id), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, cutoff))));
  const scope: TokenScope = row.scope === "voice" || row.scope === "game" ? row.scope : "full";
  return { userId: row.userId, tokenId: row.id, scope };
}
