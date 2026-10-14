// The 24/7 heartbeat for Ops: a free cron service (e.g. cron-job.org, every 5 min)
// calls /api/ops/beat?u=<your id>&k=<your beat key>. It can only trigger a beat
// (at most one per minute); it returns no data. Get the URL in Ops → Connectors.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// A beat can start agent missions, which finish in after() within this limit.
export const maxDuration = 300;

async function handle(req: Request) {
  const url = new URL(req.url);
  const { beatByKey } = await import("@/lib/services/ops-beat");
  const r = await beatByKey(Number(url.searchParams.get("u")), String(url.searchParams.get("k") ?? ""));
  if (!r.ok) return NextResponse.json({ ok: false }, { status: r.status });
  return NextResponse.json({ ok: true, ran: r.result !== null });
}

export const GET = handle;
export const POST = handle;
