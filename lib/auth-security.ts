// Server-side auth helpers. Deliberately NOT a "use server" file: every export
// of a "use server" module becomes a publicly callable HTTP endpoint, and
// these take a raw userId — exposing them would let anyone verify/burn codes
// or revoke sessions for any account.

import { createHash } from "crypto";
import { verify } from "otplib";
import { db } from "@/lib/db";
import { users, backupCodes } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Login-time 2FA check: live TOTP first, then a single-use backup code.
 *
 * Replay protection: the last accepted TOTP time step is stored and passed as
 * `afterTimeStep`, so a code that was already used (e.g. shoulder-surfed or
 * captured) can't be replayed inside its 30-second window.
 */
export async function verifyTwoFactorCode(userId: number, code: string): Promise<boolean> {
  const [user] = await db
    .select({ secret: users.twoFactorSecret, lastStep: users.totpLastStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.secret) return false;

  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed)) {
    try {
      const result = await verify({
        secret: user.secret,
        token: trimmed,
        epochTolerance: 30,
        ...(user.lastStep != null ? { afterTimeStep: user.lastStep } : {}),
      });
      if (result.valid) {
        // verify() is typed as a TOTP|HOTP union; only the TOTP branch has timeStep.
        const step = "timeStep" in result ? result.timeStep : null;
        if (step != null) await db.update(users).set({ totpLastStep: step }).where(eq(users.id, userId));
        return true;
      }
    } catch {
      // Malformed token — fall through to the backup-code check.
    }
  }

  // Atomic single-use: the UPDATE only matches an unused code, so two
  // concurrent logins can't both spend the same backup code.
  const used = await db
    .update(backupCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(backupCodes.userId, userId),
        eq(backupCodes.codeHash, hashBackupCode(trimmed.toUpperCase())),
        isNull(backupCodes.usedAt)
      )
    )
    .returning({ id: backupCodes.id });
  return used.length > 0;
}

/** Current session version for a user (null if the user no longer exists). */
export async function getSessionVersion(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ v: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ? row.v : null;
}

/**
 * Revokes every existing session for this user. JWT sessions are stateless,
 * so we can't delete them — instead each token carries the version it was
 * issued with, and auth.ts rejects tokens whose version is behind the DB.
 * Returns the new version so the caller's own session can be re-issued.
 */
export async function bumpSessionVersion(userId: number): Promise<number> {
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ v: users.sessionVersion });
  return row?.v ?? 0;
}
