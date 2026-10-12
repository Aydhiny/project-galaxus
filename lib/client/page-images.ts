// Images for Pages: shrink in the browser (WebP, longest side ≤ 1800 px) and
// upload. GIFs keep their animation and go up as-is.

const MAX_SIDE = 1800;

async function compress(file: Blob): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
  return out && out.size < file.size ? out : file;
}

export async function uploadPageImage(file: Blob): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  const blob = await compress(file);
  const fd = new FormData();
  fd.set("file", blob, "image");
  const res = await fetch("/api/page-files", { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Upload failed.");
  return body.url as string;
}

/** Images on the clipboard / in a drop. */
export function imageFiles(list: DataTransfer | null): File[] {
  if (!list) return [];
  const files = Array.from(list.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (files.length) return files;
  return Array.from(list.items ?? []).filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
}
