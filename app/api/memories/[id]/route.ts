// Serves one album photo from Postgres — only to its owner (session checked).

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";
import { memoryImageFor } from "@/lib/services/wellbeing";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return new NextResponse("Not signed in", { status: 401 });
  }
  const { id } = await params;
  const img = await memoryImageFor(userId, Number(id));
  if (!img) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(img.data, "base64"), {
    headers: {
      "Content-Type": img.mime,
      // Private: never cached by shared caches/CDN; the browser may keep it for a day.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
