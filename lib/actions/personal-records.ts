"use server";

import { db } from "@/lib/db";
import { personalRecords } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getPersonalRecords(exercise?: string) {
  try {
    const userId = await requireUserId();
    if (exercise) {
      return db.select().from(personalRecords)
        .where(and(eq(personalRecords.userId, userId), eq(personalRecords.exercise, exercise)))
        .orderBy(desc(personalRecords.recordedAt));
    }
    return db.select().from(personalRecords).where(eq(personalRecords.userId, userId)).orderBy(desc(personalRecords.recordedAt));
  } catch { return []; }
}

export async function getExerciseList() {
  try {
    const userId = await requireUserId();
    const rows = await db.select({ exercise: personalRecords.exercise }).from(personalRecords).where(eq(personalRecords.userId, userId));
    return [...new Set(rows.map(r => r.exercise))].sort();
  } catch { return []; }
}

export async function getPersonalBests() {
  try {
    const userId = await requireUserId();
    const all = await db.select().from(personalRecords).where(eq(personalRecords.userId, userId)).orderBy(desc(personalRecords.recordedAt));
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
  const userId = await requireUserId();
  const row = await db.insert(personalRecords).values({
    userId,
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
  const userId = await requireUserId();
  await db.delete(personalRecords).where(and(eq(personalRecords.id, id), eq(personalRecords.userId, userId)));
  revalidatePath("/training");
}
