import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/ratelimit";
import { hitRateLimit } from "@/lib/rate-limit-db";
import { createVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed, retryAfterSeconds } = checkRateLimit(`register:${ip}`);
    if (!allowed) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${retryAfterSeconds}s.` }, { status: 429 });
    }

    // Shared across instances: at most 10 new accounts per IP per hour.
    const perIp = await hitRateLimit(`register-ip:${ip}`, 10, 60 * 60 * 1000);
    if (!perIp.allowed) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil(perIp.retryAfterSeconds / 60)} min.` }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as { name?: unknown; email?: unknown; password?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name.trim() || name.trim().length > 100) return NextResponse.json({ error: "Name is required (up to 100 characters)." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    // bcrypt only reads the first 72 bytes; a longer "password" would silently be cut.
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    if (Buffer.byteLength(password, "utf8") > 72) return NextResponse.json({ error: "Password must be at most 72 bytes." }, { status: 400 });

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
