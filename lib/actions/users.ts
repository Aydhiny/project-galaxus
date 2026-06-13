"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function registerUser(name: string, email: string, password: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return { error: "An account with this email already exists." };

  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({ name, email, passwordHash });
  return { success: true };
}

export async function getUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
