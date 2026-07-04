"use server";

import { db } from "@/lib/db";
import { users, backupCodes } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { requireUserId } from "@/lib/auth-session";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateBackupCode(): string {
  // 10 chars, groups of 5 separated by a dash — easy to read back, hard to guess.
  const raw = randomBytes(5).toString("hex").toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

/** Step 1 of enrollment — generates (but does not yet activate) a secret. */
export async function beginTwoFactorEnrollment() {
  const userId = await requireUserId();
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "Account not found." };

  const secret = generateSecret();
  await db.update(users).set({ twoFactorSecret: secret, twoFactorEnabled: false }).where(eq(users.id, userId));

  const uri = generateURI({ issuer: "Galaxus", label: user.email, secret });
  const qrDataUrl = await QRCode.toDataURL(uri);

  return { secret, qrDataUrl };
}

/** Step 2 — user proves they scanned the QR by submitting a live code. Activates 2FA and issues backup codes. */
export async function confirmTwoFactorEnrollment(code: string) {
  const userId = await requireUserId();
  const [user] = await db.select({ twoFactorSecret: users.twoFactorSecret }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.twoFactorSecret) return { error: "Start enrollment first." };

  const result = await verify({ secret: user.twoFactorSecret, token: code, epochTolerance: 30 });
  if (!result.valid) return { error: "Incorrect code. Check your authenticator app and try again." };

  await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));

  // Fresh backup codes every time 2FA is (re-)enabled — old ones are invalidated.
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  const codes = Array.from({ length: 10 }, generateBackupCode);
  await db.insert(backupCodes).values(codes.map((code) => ({ userId, codeHash: hashCode(code) })));

  return { success: true, backupCodes: codes };
}

export async function disableTwoFactor(password: string) {
  const userId = await requireUserId();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "Account not found." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "Password is incorrect." };

  await db.update(users).set({ twoFactorEnabled: false, twoFactorSecret: null }).where(eq(users.id, userId));
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  return { success: true };
}

/**
 * Used from auth.ts's authorize() — no session exists yet at that point, so
 * this takes a userId directly rather than going through requireUserId().
 * Tries a live TOTP code first, then falls back to a single-use backup code.
 */
export async function verifyTwoFactorCode(userId: number, code: string): Promise<boolean> {
  const [user] = await db.select({ twoFactorSecret: users.twoFactorSecret }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.twoFactorSecret) return false;

  // otplib's verify() throws (rather than returning invalid) when the token
  // isn't a plain 6-digit string — which backup codes never are — so this
  // must not be allowed to skip the backup-code fallback below.
  try {
    const totpResult = await verify({ secret: user.twoFactorSecret, token: code, epochTolerance: 30 });
    if (totpResult.valid) return true;
  } catch {
    // Not a valid TOTP token shape — fall through to backup-code check.
  }

  const normalized = code.trim().toUpperCase();
  const codeHash = hashCode(normalized);
  const rows = await db
    .select()
    .from(backupCodes)
    .where(and(eq(backupCodes.userId, userId), eq(backupCodes.codeHash, codeHash), isNull(backupCodes.usedAt)))
    .limit(1);

  const match = rows[0];
  if (!match) return false;

  await db.update(backupCodes).set({ usedAt: new Date() }).where(eq(backupCodes.id, match.id));
  return true;
}
