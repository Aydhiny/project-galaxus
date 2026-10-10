// How many voice commands are waiting — lets the runner exit in seconds
// (without installing Claude Code) when there's nothing to do.
import { NextRequest, NextResponse } from "next/server";
import { voiceRunnerAuth } from "@/lib/api/voice-auth";
import { queuedCountFor } from "@/lib/services/voice";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await voiceRunnerAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ queued: await queuedCountFor(auth.userId) });
}
