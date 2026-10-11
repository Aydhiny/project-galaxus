// Your azan recording: upload (POST, multipart), play (GET), remove (DELETE). Owner only.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";
import { azanFor, deleteAzanFor, saveAzanFor } from "@/lib/services/prayer";

async function user() {
  try { return await requireUserId(); } catch { return null; }
}

export async function GET() {
  const userId = await user();
  if (!userId) return new NextResponse("Not signed in", { status: 401 });
  const f = await azanFor(userId);
  if (!f) return new NextResponse("No azan uploaded", { status: 404 });
  return new NextResponse(Buffer.from(f.data, "base64"), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400" } });
}

export async function POST(req: Request) {
  const userId = await user();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  try {
    await saveAzanFor(userId, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}

export async function DELETE() {
  const userId = await user();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await deleteAzanFor(userId);
  return NextResponse.json({ ok: true });
}
