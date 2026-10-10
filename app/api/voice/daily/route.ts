// Scheduler beat from the voice runner: build today's daily brief once
// (fetch feeds + images, queue Claude). Idempotent; voice-scoped token only.
import { NextRequest, NextResponse } from "next/server";
import { voiceRunnerAuth } from "@/lib/api/voice-auth";
import { dailyFor } from "@/lib/services/voice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await voiceRunnerAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await dailyFor(auth.userId));
  } catch (e) {
    console.error("[daily]", e);
    return NextResponse.json({ error: "Daily build failed" }, { status: 500 });
  }
}
