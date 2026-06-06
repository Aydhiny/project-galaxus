"use server";

import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getCourses() {
  try {
    return await db.select().from(courses).orderBy(desc(courses.createdAt));
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
  const now = new Date();
  await db.insert(courses).values({
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
    .where(eq(courses.id, id));
  revalidatePath("/study");
}

export async function deleteCourse(id: number) {
  await db.delete(courses).where(eq(courses.id, id));
  revalidatePath("/study");
}
