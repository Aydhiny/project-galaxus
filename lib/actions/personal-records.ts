"use server";

import { db } from "@/lib/db";
import { personalRecords } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getPersonalRecords(exercise?: string) {
  try {
    if (exercise) {
      return db.select().from(personalRecords)
        .where(eq(personalRecords.exercise, exercise))
        .orderBy(desc(personalRecords.recordedAt));
    }
    return db.select().from(personalRecords).orderBy(desc(personalRecords.recordedAt));
  } catch { return []; }
}

export async function getExerciseList() {
  try {
    const rows = await db.select({ exercise: personalRecords.exercise }).from(personalRecords);
    return [...new Set(rows.map(r => r.exercise))].sort();
  } catch { return []; }
}

export async function getPersonalBests() {
  try {
    const all = await db.select().from(personalRecords).orderBy(desc(personalRecords.recordedAt));
    const bests = new Map<string, typeof all[0]>();
    for (const r of all) {
      const prev = bests.get(r.exercise);
      if (!prev || r.value > prev.value) bests.set(r.exercise, r);
    }
    return [...bests.values()];
  } catch { return []; }
}

export async function addPersonalRecord(data: {
  exercise: string;
  value: number;
  unit?: string;
  notes?: string;
  recordedAt: string;
}) {
  const row = await db.insert(personalRecords).values({
    exercise: data.exercise,
    value: data.value,
    unit: data.unit ?? "kg",
    notes: data.notes,
    recordedAt: data.recordedAt,
  }).returning();
  revalidatePath("/training");
  return row[0];
}

export async function deletePersonalRecord(id: number) {
  await db.delete(personalRecords).where(eq(personalRecords.id, id));
  revalidatePath("/training");
}
