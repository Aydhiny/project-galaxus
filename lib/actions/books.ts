"use server";

import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getBooks() {
  try {
    const userId = await requireUserId();
    return db.select().from(books).where(eq(books.userId, userId)).orderBy(desc(books.createdAt));
  } catch {
    return [];
  }
}

export async function addBook(data: {
  title: string;
  author?: string;
  pagesTotal?: number;
  status?: string;
  coverColor?: string;
}) {
  const userId = await requireUserId();
  await db.insert(books).values({
    userId,
    title: data.title,
    author: data.author,
    pagesTotal: data.pagesTotal,
    status: data.status ?? "reading",
    coverColor: data.coverColor ?? "#C9A84C",
    startedAt:
      data.status === "reading"
        ? new Date().toISOString().split("T")[0]
        : undefined,
  });
  revalidatePath("/reading");
}

export async function updateBookProgress(id: number, pagesRead: number) {
  const userId = await requireUserId();
  const book = await db.select().from(books).where(and(eq(books.id, id), eq(books.userId, userId))).limit(1);
  if (!book[0]) return;

  const isComplete =
    book[0].pagesTotal != null && pagesRead >= book[0].pagesTotal;

  await db
    .update(books)
    .set({
      pagesRead,
      status: isComplete ? "completed" : "reading",
      completedAt: isComplete
        ? new Date().toISOString().split("T")[0]
        : undefined,
    })
    .where(and(eq(books.id, id), eq(books.userId, userId)));

  revalidatePath("/reading");
}

export async function markBookComplete(id: number, rating?: number) {
  const userId = await requireUserId();
  await db
    .update(books)
    .set({
      status: "completed",
      completedAt: new Date().toISOString().split("T")[0],
      rating,
    })
    .where(and(eq(books.id, id), eq(books.userId, userId)));
  revalidatePath("/reading");
}

export async function deleteBook(id: number) {
  const userId = await requireUserId();
  await db.delete(books).where(and(eq(books.id, id), eq(books.userId, userId)));
  revalidatePath("/reading");
}

export async function getMonthlyReadingStats() {
  try {
    const userId = await requireUserId();
    const all = await db.select().from(books).where(eq(books.userId, userId));
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const completedThisMonth = all.filter((b) => {
      if (!b.completedAt) return false;
      const d = new Date(b.completedAt);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });

    return {
      completedThisMonth: completedThisMonth.length,
      totalCompleted: all.filter((b) => b.status === "completed").length,
      currentlyReading: all.filter((b) => b.status === "reading").length,
      planned: all.filter((b) => b.status === "planned").length,
    };
  } catch {
    return { completedThisMonth: 0, totalCompleted: 0, currentlyReading: 0, planned: 0 };
  }
}
