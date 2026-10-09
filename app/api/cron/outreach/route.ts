// Outreach scheduler beat. Called every ~15 min on workdays by GitHub Actions
// (.github/workflows/outreach-tick.yml) with a personal Galaxus API token —
// so it runs for exactly the user who owns that token, and needs no Vercel
// cron or env var. /api/cron/* is excluded from the session proxy.

import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/services/api-tokens";
import { tickFor } from "@/lib/services/outreach/engine";
import { checkRateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hit = await verifyApiToken(bearer);
  if (!hit) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`outreach-tick:${hit.tokenId}`, 10, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  try {
    return NextResponse.json(await tickFor(hit.userId));
  } catch (e) {
    console.error("[outreach tick]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Tick failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
