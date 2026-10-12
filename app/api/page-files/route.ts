// Upload an image for Pages (your session). The browser already compressed it
// (WebP, ≤1800 px), so it fits comfortably under Vercel's 4.5 MB request cap.
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pageFiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
const MAX = 4 * 1024 * 1024;
const QUOTA = 300 * 1024 * 1024; // per user

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || !/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.type)) return NextResponse.json({ error: "Only images (png, jpg, webp, gif)." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image is over 4 MB even after compression." }, { status: 400 });
  const [{ used }] = await db.select({ used: sql<number>`coalesce(sum(${pageFiles.bytes}),0)::bigint` }).from(pageFiles).where(eq(pageFiles.userId, userId));
  if (Number(used) + file.size > QUOTA) return NextResponse.json({ error: "Your Pages image space is full (300 MB)." }, { status: 400 });
  const id = randomUUID().replace(/-/g, "");
  await db.insert(pageFiles).values({ id, userId, mime: file.type, data: Buffer.from(await file.arrayBuffer()).toString("base64"), bytes: file.size });
  return NextResponse.json({ url: `/api/page-files/${id}` });
}

