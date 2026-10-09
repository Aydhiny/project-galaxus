"use server";

import { db } from "@/lib/db";
import { users, backupCodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { requireUserId } from "@/lib/auth-session";
import { hashBackupCode } from "@/lib/auth-security";
import { revokeOtherSessions } from "@/lib/session-revoke";

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

  const step = "timeStep" in result ? result.timeStep : null;
  await db.update(users).set({ twoFactorEnabled: true, totpLastStep: step }).where(eq(users.id, userId));
  // Turning 2FA on should kick out any session that was opened without it.
  await revokeOtherSessions(userId);

  // Fresh backup codes every time 2FA is (re-)enabled — old ones are invalidated.
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  const codes = Array.from({ length: 10 }, generateBackupCode);
  await db.insert(backupCodes).values(codes.map((code) => ({ userId, codeHash: hashBackupCode(code) })));

  return { success: true, backupCodes: codes };
}

/** password is only required if the account has one set (OAuth-only accounts have nothing to verify against). */
export async function disableTwoFactor(password?: string) {
  const userId = await requireUserId();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "Account not found." };

  if (user.passwordHash) {
    if (!password) return { error: "Password is required." };
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { error: "Password is incorrect." };
  }

  await db.update(users).set({ twoFactorEnabled: false, twoFactorSecret: null, totpLastStep: null }).where(eq(users.id, userId));
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  await revokeOtherSessions(userId);
  return { success: true };
}
