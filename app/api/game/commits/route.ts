// Commit feed: the game repo's GitHub Action POSTs each push's commit
// messages here with a scope="game" Galaxus token. That token can do nothing
// else, and Galaxus never needs a GitHub token to read the (private) repo.
import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/services/api-tokens";
import { checkRateLimit } from "@/lib/ratelimit";
import { receiveCommitsFor } from "@/lib/services/game";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hit = await verifyApiToken(bearer);
  if (!hit || hit.scope !== "game") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`game-feed:${hit.tokenId}`, 30, 60_000).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { repo?: unknown; commits?: unknown } | null;
  if (!body || typeof body.repo !== "string" || !Array.isArray(body.commits)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const added = await receiveCommitsFor(hit.userId, body.repo, body.commits as { sha?: unknown; message?: unknown; date?: unknown }[]);
    return NextResponse.json({ added });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
