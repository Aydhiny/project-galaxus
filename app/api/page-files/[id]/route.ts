// Serve a Pages image — only to its owner (private, long-cached per browser).
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pageFiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const id = (await params).id;
  if (!/^[\w-]{8,64}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [f] = await db.select({ mime: pageFiles.mime, data: pageFiles.data }).from(pageFiles).where(and(eq(pageFiles.id, id), eq(pageFiles.userId, userId))).limit(1);
  if (!f) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(f.data, "base64")), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
