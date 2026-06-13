"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function registerUser(name: string, email: string, password: string): Promise<{ error?: string; success?: boolean }> {
  try {
    if (!name.trim()) return { error: "Name is required." };
    if (!email.includes("@")) return { error: "Enter a valid email." };
    if (password.length < 8) return { error: "Password must be at least 8 characters." };

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing[0]) return { error: "An account with this email already exists." };

    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(users).values({ name: name.trim(), email: email.toLowerCase(), passwordHash });
    return { success: true };
  } catch (err) {
    console.error("registerUser error:", err);
    return { error: "Registration failed. Please try again." };
  }
}
