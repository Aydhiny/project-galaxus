"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/ratelimit";
import { hitRateLimit } from "@/lib/rate-limit-db";
import { createVerificationToken, consumeVerificationToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { bumpSessionVersion } from "@/lib/auth-security";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

/** Always returns the same message regardless of whether the email exists — avoids account enumeration. */
export async function requestPasswordReset(email: string) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, retryAfterSeconds } = checkRateLimit(`reset:${ip}`);
  if (!allowed) return { error: `Too many attempts. Try again in ${retryAfterSeconds}s.` };

  const normalized = String(email ?? "").trim().toLowerCase().slice(0, 254);
  // Shared across instances. Per IP (scripted abuse), and per address so nobody
  // can flood someone's inbox with reset emails by rotating IPs. Over the
  // per-address limit we still answer with the same message (no enumeration).
  const perIp = await hitRateLimit(`reset-ip:${ip}`, 10, 60 * 60 * 1000);
  if (!perIp.allowed) return { error: `Too many attempts. Try again in ${Math.ceil(perIp.retryAfterSeconds / 60)} min.` };
  const perEmail = await hitRateLimit(`reset-email:${normalized}`, 3, 60 * 60 * 1000);

  const rows = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const user = perEmail.allowed ? rows[0] : undefined;

  if (user) {
    // Send after the response: awaiting the email provider made "account
    // exists" responses measurably slower than "no account" ones, leaking
    // which emails are registered despite the identical message.
    after(async () => {
      try {
        const rawToken = await createVerificationToken(user.id, "password_reset");
        await sendPasswordResetEmail(user.email, rawToken);
      } catch (err) {
        console.error("Failed to send password reset email:", err);
      }
    });
  }

  return { message: GENERIC_MESSAGE };
}

export async function resetPassword(rawToken: string, newPassword: string) {
  if (typeof newPassword !== "string" || newPassword.length < 8) return { error: "Password must be at least 8 characters." };
  if (Buffer.byteLength(newPassword, "utf8") > 72) return { error: "Password must be at most 72 bytes." };

  const userId = await consumeVerificationToken(rawToken, "password_reset");
  if (!userId) return { error: "This reset link is invalid or has expired." };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  // Clicking the emailed link proves the address is theirs, so it counts as verified too.
  await db.update(users).set({ passwordHash, emailVerified: new Date() }).where(eq(users.id, userId));
  // Whoever had the old password (or an old session) is out — everywhere.
  await bumpSessionVersion(userId);
  return { success: true };
}

export async function verifyEmail(rawToken: string) {
  const userId = await consumeVerificationToken(rawToken, "email_verify");
  if (!userId) return { error: "This verification link is invalid or has expired." };

  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, userId));
  return { success: true };
}
