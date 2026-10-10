// The runner reports back: ok + Claude's one-line summary, or an error.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { voiceRunnerAuth } from "@/lib/api/voice-auth";
import { completeFor } from "@/lib/services/voice";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await voiceRunnerAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => null)) as { id?: unknown; ok?: unknown; summary?: unknown; error?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const row = await completeFor(auth.userId, id, {
    ok: body?.ok === true,
    summary: typeof body?.summary === "string" ? body.summary : undefined,
    error: typeof body?.error === "string" ? body.error : undefined,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  revalidatePath("/tasks");
  revalidatePath("/productivity");
  revalidatePath("/voice");
  return NextResponse.json({ ok: true });
}
