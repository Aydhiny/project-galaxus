"use server";

import { db } from "@/lib/db";
import { studySessions } from "@/lib/db/schema";
import { desc, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { subDays, format } from "date-fns";
import { eq } from "drizzle-orm";

export async function getStudySessions(days = 30) {
  try {
    const since = format(subDays(new Date(), days), "yyyy-MM-dd");
    return db.select().from(studySessions)
      .where(gte(studySessions.date, since))
      .orderBy(desc(studySessions.date));
  } catch { return []; }
}

export async function addStudySession(data: {
  date: string;
  topic?: string;
  courseId?: number;
  hours: number;
  notes?: string;
}) {
  const row = await db.insert(studySessions).values({
    date: data.date,
    topic: data.topic,
    courseId: data.courseId,
    hours: data.hours,
    notes: data.notes,
  }).returning();
  revalidatePath("/study");
  return row[0];
}

export async function deleteStudySession(id: number) {
  await db.delete(studySessions).where(eq(studySessions.id, id));
  revalidatePath("/study");
}
