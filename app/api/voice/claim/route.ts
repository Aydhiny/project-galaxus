// Hands the runner the next queued command (transcript + prompts) and marks
// it running. 204 when the queue is empty.
import { NextRequest, NextResponse } from "next/server";
import { voiceRunnerAuth } from "@/lib/api/voice-auth";
import { claimNextFor } from "@/lib/services/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await voiceRunnerAuth(req);
  if (auth instanceof NextResponse) return auth;
  const job = await claimNextFor(auth.userId);
  if (!job) return new NextResponse(null, { status: 204 });
  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
}
