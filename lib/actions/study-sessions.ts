"use server";

import { db } from "@/lib/db";
import { studySessions, courses, users } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { subDays, format } from "date-fns";
import { requireUserId } from "@/lib/auth-session";
import { clampHistoryDays } from "@/lib/plan";

export async function getStudySessions(days = 30) {
  try {
    const userId = await requireUserId();
    const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    const cappedDays = clampHistoryDays(user?.plan ?? "free", days);
    const since = format(subDays(new Date(), cappedDays), "yyyy-MM-dd");
    return db.select().from(studySessions)
      .where(and(eq(studySessions.userId, userId), gte(studySessions.date, since)))
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
  const userId = await requireUserId();

  if (data.courseId != null) {
    const owned = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, data.courseId), eq(courses.userId, userId))).limit(1);
    if (!owned[0]) throw new Error("Course not found.");
  }

  const row = await db.insert(studySessions).values({
    userId,
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
  const userId = await requireUserId();
  await db.delete(studySessions).where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)));
  revalidatePath("/study");
}
