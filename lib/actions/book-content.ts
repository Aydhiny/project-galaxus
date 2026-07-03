"use server";

import { db } from "@/lib/db";
import { bookContent, books } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getBookContent(bookId: number) {
  try {
    const userId = await requireUserId();
    const rows = await db.select().from(bookContent).where(and(eq(bookContent.bookId, bookId), eq(bookContent.userId, userId))).limit(1);
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
  const userId = await requireUserId();

  const owned = await db.select({ id: books.id }).from(books).where(and(eq(books.id, data.bookId), eq(books.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("Book not found.");

  const existing = await getBookContent(data.bookId);
  if (existing) {
    await db.update(bookContent)
      .set({ fileUrl: data.fileUrl, fileType: data.fileType, fileName: data.fileName, fileSize: data.fileSize })
      .where(and(eq(bookContent.bookId, data.bookId), eq(bookContent.userId, userId)));
  } else {
    await db.insert(bookContent).values({
      userId,
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
  const userId = await requireUserId();
  await db.delete(bookContent).where(and(eq(bookContent.bookId, bookId), eq(bookContent.userId, userId)));
  revalidatePath("/reading");
}
