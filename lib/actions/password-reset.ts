"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/ratelimit";
import { createVerificationToken, consumeVerificationToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

/** Always returns the same message regardless of whether the email exists — avoids account enumeration. */
export async function requestPasswordReset(email: string) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, retryAfterSeconds } = checkRateLimit(ip);
  if (!allowed) return { error: `Too many attempts. Try again in ${retryAfterSeconds}s.` };

  const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  const user = rows[0];

  if (user) {
    const rawToken = await createVerificationToken(user.id, "password_reset");
    await sendPasswordResetEmail(user.email, rawToken);
  }

  return { message: GENERIC_MESSAGE };
}

export async function resetPassword(rawToken: string, newPassword: string) {
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const userId = await consumeVerificationToken(rawToken, "password_reset");
  if (!userId) return { error: "This reset link is invalid or has expired." };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  return { success: true };
}

export async function verifyEmail(rawToken: string) {
  const userId = await consumeVerificationToken(rawToken, "email_verify");
  if (!userId) return { error: "This verification link is invalid or has expired." };

  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, userId));
  return { success: true };
}
