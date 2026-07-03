"use server";

import { db } from "@/lib/db";
import { bookmarks, books } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth-session";

export async function getBookmarks(bookId: number) {
  try {
    const userId = await requireUserId();
    return db.select().from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.bookId, bookId)))
      .orderBy(bookmarks.page);
  } catch { return []; }
}

export async function addBookmark(data: { bookId: number; page: number; note?: string }) {
  const userId = await requireUserId();

  const owned = await db.select({ id: books.id }).from(books).where(and(eq(books.id, data.bookId), eq(books.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("Book not found.");

  const row = await db.insert(bookmarks).values({
    userId,
    bookId: data.bookId,
    page: data.page,
    note: data.note,
  }).returning();
  return row[0];
}

export async function deleteBookmark(id: number) {
  const userId = await requireUserId();
  await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
}
