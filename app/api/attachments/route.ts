// Image uploads for task attachments → Vercel Blob.
// Session-only (behind the auth proxy + checked again here), images only,
// 8 MB max, stored under the user's own prefix.

import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Only PNG, JPEG, WebP or GIF images." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 8 MB)." }, { status: 413 });

  try {
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "image";
    const blob = await put(`attachments/${userId}/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true, // unguessable URL
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Attachment upload failed:", err);
    return NextResponse.json(
      { error: "Image storage isn't configured yet — links still work. (Connect a Vercel Blob store.)" },
      { status: 503 }
    );
  }
}
