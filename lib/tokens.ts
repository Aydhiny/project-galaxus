import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { verificationTokens } from "@/lib/db/schema";
import { and, eq, gt, lt, or } from "drizzle-orm";

export type TokenPurpose = "password_reset" | "email_verify";

const TTL_MS: Record<TokenPurpose, number> = {
  password_reset: 60 * 60 * 1000, // 1 hour
  email_verify: 24 * 60 * 60 * 1000, // 24 hours
};

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a token and returns the raw (unhashed) value — only the hash is stored.
 *
 * Rotation: issuing a new token deletes every earlier token for the same
 * user + purpose, so only the most recent email link works. Before this, each
 * "forgot password" click minted another live link and all of them stayed
 * valid for an hour — an old email sitting in an inbox was still a key.
 */
export async function createVerificationToken(userId: number, purpose: TokenPurpose): Promise<string> {
  const rawToken = generateToken();
  await db
    .delete(verificationTokens)
    .where(
      or(
        and(eq(verificationTokens.userId, userId), eq(verificationTokens.purpose, purpose)),
        lt(verificationTokens.expiresAt, new Date()) // opportunistic cleanup of anyone's expired tokens
      )
    );
  await db.insert(verificationTokens).values({
    userId,
    tokenHash: hashToken(rawToken),
    purpose,
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return rawToken;
}

/**
 * Validates and consumes a token in ONE statement (DELETE … RETURNING).
 * The old select-then-delete version had a race: two concurrent requests with
 * the same link could both pass the SELECT before either DELETE ran, letting
 * a single-use token be used twice.
 */
export async function consumeVerificationToken(rawToken: string, purpose: TokenPurpose): Promise<number | null> {
  if (typeof rawToken !== "string" || !/^[a-f0-9]{64}$/.test(rawToken)) return null;
  const rows = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(rawToken)),
        eq(verificationTokens.purpose, purpose),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .returning({ userId: verificationTokens.userId });
  return rows[0]?.userId ?? null;
}
