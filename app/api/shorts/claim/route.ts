import { NextRequest, NextResponse } from "next/server";
import { shortsWorkerAuth } from "@/lib/api/shorts-auth";
import { claimShortJobFor } from "@/lib/services/shorts";

export const dynamic = "force-dynamic";

/** Worker heartbeat + next job (or null). */
export async function POST(req: NextRequest) {
  const a = await shortsWorkerAuth(req);
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ job: await claimShortJobFor(a.userId) });
}
