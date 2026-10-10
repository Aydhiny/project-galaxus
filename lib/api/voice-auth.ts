// Auth for the voice runner endpoints (/api/voice/*): a Galaxus API token with
// scope "voice" only. Full tokens are rejected too — least privilege both ways.

import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/services/api-tokens";
import { checkRateLimit } from "@/lib/ratelimit";

export async function voiceRunnerAuth(req: NextRequest): Promise<{ userId: number } | NextResponse> {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hit = await verifyApiToken(bearer);
  if (!hit || hit.scope !== "voice") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`voice-runner:${hit.tokenId}`, 60, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return { userId: hit.userId };
}
