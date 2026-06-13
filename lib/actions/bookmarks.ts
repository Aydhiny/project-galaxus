"use server";

import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getBookmarks(bookId: number) {
  try {
    return db.select().from(bookmarks)
      .where(eq(bookmarks.bookId, bookId))
      .orderBy(bookmarks.page);
  } catch { return []; }
}

export async function addBookmark(data: { bookId: number; page: number; note?: string }) {
  const row = await db.insert(bookmarks).values({
    bookId: data.bookId,
    page: data.page,
    note: data.note,
  }).returning();
  return row[0];
}

export async function deleteBookmark(id: number) {
  await db.delete(bookmarks).where(eq(bookmarks.id, id));
}
