import { NextRequest, NextResponse } from "next/server";
import { shortsWorkerAuth } from "@/lib/api/shorts-auth";
import { completeShortJobFor } from "@/lib/services/shorts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await shortsWorkerAuth(req);
  if (a instanceof NextResponse) return a;
  try {
    await completeShortJobFor(a.userId, Number((await params).id), await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
