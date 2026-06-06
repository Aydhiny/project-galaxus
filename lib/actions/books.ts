"use server";

import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getBooks() {
  return db.select().from(books).orderBy(desc(books.createdAt));
}

export async function addBook(data: {
  title: string;
  author?: string;
  pagesTotal?: number;
  status?: string;
  coverColor?: string;
}) {
  await db.insert(books).values({
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
  const book = await db.select().from(books).where(eq(books.id, id)).limit(1);
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
    .where(eq(books.id, id));

  revalidatePath("/reading");
}

export async function markBookComplete(id: number, rating?: number) {
  await db
    .update(books)
    .set({
      status: "completed",
      completedAt: new Date().toISOString().split("T")[0],
      rating,
    })
    .where(eq(books.id, id));
  revalidatePath("/reading");
}

export async function deleteBook(id: number) {
  await db.delete(books).where(eq(books.id, id));
  revalidatePath("/reading");
}

export async function getMonthlyReadingStats() {
  const all = await db.select().from(books);
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
}
