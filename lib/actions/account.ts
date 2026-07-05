"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireUserId } from "@/lib/auth-session";
import { revalidatePath } from "next/cache";

export async function getAccountInfo() {
  const userId = await requireUserId();
  const rows = await db
    .select({
      id: users.id, name: users.name, email: users.email, plan: users.plan,
      emailVerified: users.emailVerified, twoFactorEnabled: users.twoFactorEnabled,
      passwordHash: users.passwordHash,
      subscriptionStatus: users.subscriptionStatus, currentPeriodEnd: users.currentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const { passwordHash, ...rest } = row;
  return { ...rest, hasPassword: !!passwordHash };
}

export async function resendVerificationEmail() {
  const userId = await requireUserId();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { error: "Account not found." };
  if (user.emailVerified) return { error: "Email is already verified." };

  const { createVerificationToken } = await import("@/lib/tokens");
  const { sendVerificationEmail } = await import("@/lib/email");
  const rawToken = await createVerificationToken(userId, "email_verify");
  await sendVerificationEmail(user.email, rawToken);
  return { success: true };
}

export async function updateProfile(data: { name: string; email: string }) {
  const userId = await requireUserId();
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();

  if (!name) return { error: "Name is required." };
  if (!email.includes("@")) return { error: "Enter a valid email." };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0] && existing[0].id !== userId) {
    return { error: "That email is already in use by another account." };
  }

  await db.update(users).set({ name, email }).where(eq(users.id, userId));
  revalidatePath("/settings");
  return { success: true };
}

/** currentPassword is only required if the account already has a password set (see hasPassword from getAccountInfo). */
export async function changePassword(data: { currentPassword?: string; newPassword: string }) {
  const userId = await requireUserId();
  if (data.newPassword.length < 8) return { error: "New password must be at least 8 characters." };

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { error: "Account not found." };

  if (user.passwordHash) {
    if (!data.currentPassword) return { error: "Current password is required." };
    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) return { error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  return { success: true };
}

/** password is only required if the account has one set (OAuth-only accounts have nothing to verify against). */
export async function deleteAccount(password?: string) {
  const userId = await requireUserId();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { error: "Account not found." };

  if (user.passwordHash) {
    if (!password) return { error: "Password is required." };
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { error: "Password is incorrect." };
  }

  // Cascades to every content table via onDelete: "cascade" FKs.
  await db.delete(users).where(eq(users.id, userId));
  return { success: true };
}
