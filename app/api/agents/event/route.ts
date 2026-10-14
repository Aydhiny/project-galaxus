// Agent activity feed: an agent's hook (see scripts/agent-hook.mjs for Claude Code)
// POSTs what it just did. Authenticated by an "agent" scope token, which can do
// nothing else; the body is a few small fields (the script strips prompts and
// tool output before sending), and eventFromHook() redacts secrets again here.
import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/services/api-tokens";
import { checkRateLimit } from "@/lib/ratelimit";
import { agentForToken, ingestHookForAgent } from "@/lib/services/ops";

export const dynamic = "force-dynamic";
const MAX_BODY = 20_000;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hit = await verifyApiToken(bearer);
  if (!hit || hit.scope !== "agent") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`agent-feed:${hit.tokenId}`, 300, 60_000).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const agent = await agentForToken(hit.tokenId);
  if (!agent) return NextResponse.json({ error: "This token isn't connected to an agent." }, { status: 404 });
  return NextResponse.json({ recorded: await ingestHookForAgent(agent, payload) });
}
