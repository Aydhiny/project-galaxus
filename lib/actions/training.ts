"use server";

import { db } from "@/lib/db";
import { trainingPlans, trainingExercises } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getTrainingPlans() {
  const userId = await requireUserId();
  return db.select().from(trainingPlans).where(eq(trainingPlans.userId, userId)).orderBy(desc(trainingPlans.createdAt));
}

export async function getActivePlan() {
  const userId = await requireUserId();
  const plans = await db
    .select()
    .from(trainingPlans)
    .where(and(eq(trainingPlans.userId, userId), eq(trainingPlans.isActive, true)))
    .limit(1);
  if (!plans[0]) return null;

  const exercises = await db
    .select()
    .from(trainingExercises)
    .where(and(eq(trainingExercises.userId, userId), eq(trainingExercises.planId, plans[0].id)))
    .orderBy(trainingExercises.orderIndex);

  return { ...plans[0], exercises };
}

export async function addTrainingPlan(data: {
  name: string;
  description?: string;
  exercises: { name: string; sets?: number; reps?: string; day?: string; weight?: string }[];
}) {
  const userId = await requireUserId();
  await db.update(trainingPlans).set({ isActive: false }).where(eq(trainingPlans.userId, userId));

  const [plan] = await db
    .insert(trainingPlans)
    .values({ userId, name: data.name, description: data.description, isActive: true })
    .returning();

  if (data.exercises.length > 0) {
    await db.insert(trainingExercises).values(
      data.exercises.map((e, i) => ({
        userId,
        planId: plan.id,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        day: e.day,
        weight: e.weight,
        orderIndex: i,
      }))
    );
  }

  revalidatePath("/training");
}

export async function setActivePlan(id: number) {
  const userId = await requireUserId();
  await db.update(trainingPlans).set({ isActive: false }).where(eq(trainingPlans.userId, userId));
  await db.update(trainingPlans).set({ isActive: true }).where(and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)));
  revalidatePath("/training");
}

export async function deleteTrainingPlan(id: number) {
  const userId = await requireUserId();
  await db.delete(trainingPlans).where(and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)));
  revalidatePath("/training");
}
