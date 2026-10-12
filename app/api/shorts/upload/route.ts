// Upload a voice recording from the Game dev page (your session), in 3 MB
// chunks: the first creates the job, the rest append, the last queues it.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { appendShortChunkFor, createShortJobFor } from "@/lib/services/shorts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const form = await req.formData();
    const chunk = form.get("chunk");
    if (!(chunk instanceof Blob)) return NextResponse.json({ error: "Pick a recording first." }, { status: 400 });
    const bytes = Buffer.from(await chunk.arrayBuffer());
    const final = form.get("final") === "1";
    const jobId = Number(form.get("jobId") ?? 0);
    if (jobId) { await appendShortChunkFor(userId, jobId, bytes, final); return NextResponse.json({ id: jobId }); }
    const job = await createShortJobFor(userId, {
      name: String(form.get("name") ?? "voice"), mime: String(form.get("mime") || "audio/mpeg"), bytes,
      notes: String(form.get("notes") ?? ""), count: Number(form.get("count") ?? 0), final,
    });
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
