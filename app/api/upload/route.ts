import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";

// The stored Content-Type comes from the file extension (never from the
// browser), so an .html or .svg upload can't be served as a web page.
const TYPES: Record<string, string> = {
  pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
};

export async function POST(req: NextRequest) {
  // The proxy already requires a session for /api/upload; checked again here (defence in depth).
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const maxSize = 50 * 1024 * 1024; // 50 MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
  }

  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const contentType = TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Only PDF and audio files are allowed" }, { status: 415 });
  }

  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-100) || `file.${ext}`;
  const blob = await put(`uploads/${userId}/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true, // unguessable URL
    contentType,
  });

  return NextResponse.json({
    url: blob.url,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });
}
