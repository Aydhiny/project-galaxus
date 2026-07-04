import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/ratelimit";
import { createVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed, retryAfterSeconds } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${retryAfterSeconds}s.` }, { status: 429 });
    }

    const { name, email, password } = await req.json();

    if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (!email?.includes("@")) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing[0]) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);
    const [newUser] = await db
      .insert(users)
      .values({ name: name.trim(), email: email.toLowerCase(), passwordHash })
      .returning({ id: users.id });

    // Fire-and-forget — a slow/failed email provider shouldn't block registration.
    createVerificationToken(newUser.id, "email_verify")
      .then((rawToken) => sendVerificationEmail(email.toLowerCase(), rawToken))
      .catch((err) => console.error("Failed to send verification email:", err));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/register error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
