import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/services/api-tokens";
import { checkRateLimit } from "@/lib/ratelimit";

/** The shorts worker on your PC: a scope="shorts" token, good for nothing else. */
export async function shortsWorkerAuth(req: NextRequest): Promise<{ userId: number } | NextResponse> {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hit = await verifyApiToken(bearer);
  if (!hit || hit.scope !== "shorts") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`shorts-worker:${hit.tokenId}`, 30, 60_000).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  return { userId: hit.userId };
}
