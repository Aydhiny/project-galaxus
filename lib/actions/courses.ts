"use server";

import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getCourses() {
  try {
    const userId = await requireUserId();
    return await db.select().from(courses).where(eq(courses.userId, userId)).orderBy(desc(courses.createdAt));
  } catch {
    return [];
  }
}

export async function addCourse(data: {
  title: string;
  platform?: string;
  instructor?: string;
  url?: string;
  notes?: string;
}) {
  const userId = await requireUserId();
  const now = new Date();
  await db.insert(courses).values({
    userId,
    title: data.title,
    platform: data.platform,
    instructor: data.instructor,
    url: data.url,
    notes: data.notes,
    status: "in_progress",
    progress: 0,
    startedAt: now.toISOString().split("T")[0],
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });
  revalidatePath("/study");
}

export async function updateCourseProgress(id: number, progress: number) {
  const userId = await requireUserId();
  const isComplete = progress >= 100;
  await db
    .update(courses)
    .set({
      progress,
      status: isComplete ? "completed" : "in_progress",
      completedAt: isComplete
        ? new Date().toISOString().split("T")[0]
        : undefined,
    })
    .where(and(eq(courses.id, id), eq(courses.userId, userId)));
  revalidatePath("/study");
}

export async function deleteCourse(id: number) {
  const userId = await requireUserId();
  await db.delete(courses).where(and(eq(courses.id, id), eq(courses.userId, userId)));
  revalidatePath("/study");
}
