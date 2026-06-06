"use server";

import { db } from "@/lib/db";
import { journalEntries } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";

export async function getJournalEntries(type?: string) {
  try {
    const all = await db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt));
    return type ? all.filter((e) => e.type === type) : all;
  } catch {
    return [];
  }
}

export async function addJournalEntry(data: {
  type: "gratitude" | "writing";
  content: string;
  mood?: number;
}) {
  await db.insert(journalEntries).values({
    type: data.type,
    content: data.content,
    mood: data.mood,
    date: format(new Date(), "yyyy-MM-dd"),
  });
  revalidatePath("/journal");
  revalidatePath("/");
}

export async function deleteJournalEntry(id: number) {
  await db.delete(journalEntries).where(eq(journalEntries.id, id));
  revalidatePath("/journal");
}

export async function getJournalStreak(type: "gratitude" | "writing") {
  const entries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.type, type))
    .orderBy(desc(journalEntries.date));

  const dates = [...new Set(entries.map((e) => e.date))].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  let streak = 0;
  let expected = new Date();

  for (const dateStr of dates) {
    const d = new Date(dateStr);
    const diffDays = Math.floor(
      (expected.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays <= 1) {
      streak++;
      expected = d;
    } else {
      break;
    }
  }

  return streak;
}
