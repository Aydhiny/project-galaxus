"use server";

import { db } from "@/lib/db";
import { bookContent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getBookContent(bookId: number) {
  try {
    const rows = await db.select().from(bookContent).where(eq(bookContent.bookId, bookId)).limit(1);
    return rows[0] ?? null;
  } catch { return null; }
}

export async function upsertBookContent(data: {
  bookId: number;
  fileUrl: string;
  fileType: string;
  fileName?: string;
  fileSize?: number;
}) {
  const existing = await getBookContent(data.bookId);
  if (existing) {
    await db.update(bookContent)
      .set({ fileUrl: data.fileUrl, fileType: data.fileType, fileName: data.fileName, fileSize: data.fileSize })
      .where(eq(bookContent.bookId, data.bookId));
  } else {
    await db.insert(bookContent).values({
      bookId: data.bookId,
      fileUrl: data.fileUrl,
      fileType: data.fileType,
      fileName: data.fileName,
      fileSize: data.fileSize,
    });
  }
  revalidatePath("/reading");
  revalidatePath(`/book-reader/${data.bookId}`);
}

export async function deleteBookContent(bookId: number) {
  await db.delete(bookContent).where(eq(bookContent.bookId, bookId));
  revalidatePath("/reading");
}
