"use server";

import { db } from "@/lib/db";
import { readingSessions } from "@/lib/db/schema";
import { eq, desc, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getReadingSessions(bookId: number) {
  try {
    return db.select().from(readingSessions)
      .where(eq(readingSessions.bookId, bookId))
      .orderBy(desc(readingSessions.date));
  } catch { return []; }
}

export async function getAllReadingSessions() {
  try {
    return db.select().from(readingSessions).orderBy(desc(readingSessions.date));
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
  const row = await db.insert(readingSessions).values({
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
  await db.delete(readingSessions).where(eq(readingSessions.id, id));
  revalidatePath("/reading");
}
