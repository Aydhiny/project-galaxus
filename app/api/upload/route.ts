import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const maxSize = 50 * 1024 * 1024; // 50 MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
  }

  const allowed = ["application/pdf", "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/flac", "audio/aac", "audio/m4a", "audio/x-m4a"];
  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|mp3|wav|ogg|flac|aac|m4a)$/i)) {
    return NextResponse.json({ error: "Only PDF and audio files are allowed" }, { status: 415 });
  }

  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return NextResponse.json({
    url: blob.url,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });
}
