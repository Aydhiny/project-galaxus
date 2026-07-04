import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { verificationTokens } from "@/lib/db/schema";
import { and, eq, gt } from "drizzle-orm";

export type TokenPurpose = "password_reset" | "email_verify";

const TTL_MS: Record<TokenPurpose, number> = {
  password_reset: 60 * 60 * 1000, // 1 hour
  email_verify: 24 * 60 * 60 * 1000, // 24 hours
};

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Creates a token, returns the raw (unhashed) value — only ever store the hash. */
export async function createVerificationToken(userId: number, purpose: TokenPurpose): Promise<string> {
  const rawToken = generateToken();
  await db.insert(verificationTokens).values({
    userId,
    tokenHash: hashToken(rawToken),
    purpose,
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return rawToken;
}

/** Validates + single-use consumes a token. Returns the userId on success, null otherwise. */
export async function consumeVerificationToken(rawToken: string, purpose: TokenPurpose): Promise<number | null> {
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.tokenHash, tokenHash), eq(verificationTokens.purpose, purpose), gt(verificationTokens.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db.delete(verificationTokens).where(eq(verificationTokens.id, row.id));
  return row.userId;
}
