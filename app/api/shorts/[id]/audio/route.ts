import { NextRequest, NextResponse } from "next/server";
import { shortsWorkerAuth } from "@/lib/api/shorts-auth";
import { shortAudioFor } from "@/lib/services/shorts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await shortsWorkerAuth(req);
  if (a instanceof NextResponse) return a;
  const f = await shortAudioFor(a.userId, Number((await params).id));
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"` } });
}
