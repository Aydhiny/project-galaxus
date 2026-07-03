"use server";

import { db } from "@/lib/db";
import { readingSessions, books } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getReadingSessions(bookId: number) {
  try {
    const userId = await requireUserId();
    return db.select().from(readingSessions)
      .where(and(eq(readingSessions.userId, userId), eq(readingSessions.bookId, bookId)))
      .orderBy(desc(readingSessions.date));
  } catch { return []; }
}

export async function getAllReadingSessions() {
  try {
    const userId = await requireUserId();
    return db.select().from(readingSessions).where(eq(readingSessions.userId, userId)).orderBy(desc(readingSessions.date));
  } catch { return []; }
}

export async function addReadingSession(data: {
  bookId: number;
  date: string;
  minutesRead: number;
  pagesRead: number;
  startPage?: number;
  endPage?: number;
}) {
  const userId = await requireUserId();

  const owned = await db.select({ id: books.id }).from(books).where(and(eq(books.id, data.bookId), eq(books.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("Book not found.");

  const row = await db.insert(readingSessions).values({
    userId,
    bookId: data.bookId,
    date: data.date,
    minutesRead: data.minutesRead,
    pagesRead: data.pagesRead,
    startPage: data.startPage,
    endPage: data.endPage,
  }).returning();
  revalidatePath("/reading");
  return row[0];
}

export async function deleteReadingSession(id: number) {
  const userId = await requireUserId();
  await db.delete(readingSessions).where(and(eq(readingSessions.id, id), eq(readingSessions.userId, userId)));
  revalidatePath("/reading");
}
