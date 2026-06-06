"use server";

import { db } from "@/lib/db";
import { trainingPlans, trainingExercises } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getTrainingPlans() {
  return db.select().from(trainingPlans).orderBy(desc(trainingPlans.createdAt));
}

export async function getActivePlan() {
  const plans = await db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.isActive, true))
    .limit(1);
  if (!plans[0]) return null;

  const exercises = await db
    .select()
    .from(trainingExercises)
    .where(eq(trainingExercises.planId, plans[0].id))
    .orderBy(trainingExercises.orderIndex);

  return { ...plans[0], exercises };
}

export async function addTrainingPlan(data: {
  name: string;
  description?: string;
  exercises: { name: string; sets?: number; reps?: string; day?: string; weight?: string }[];
}) {
  await db.update(trainingPlans).set({ isActive: false });

  const [plan] = await db
    .insert(trainingPlans)
    .values({ name: data.name, description: data.description, isActive: true })
    .returning();

  if (data.exercises.length > 0) {
    await db.insert(trainingExercises).values(
      data.exercises.map((e, i) => ({
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
  await db.update(trainingPlans).set({ isActive: false });
  await db.update(trainingPlans).set({ isActive: true }).where(eq(trainingPlans.id, id));
  revalidatePath("/training");
}

export async function deleteTrainingPlan(id: number) {
  await db.delete(trainingPlans).where(eq(trainingPlans.id, id));
  revalidatePath("/training");
}
