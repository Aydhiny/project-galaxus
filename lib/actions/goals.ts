"use server";

import { db } from "@/lib/db";
import { dailyGoals, goalCompletions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";

export async function getGoals() {
  return db
    .select()
    .from(dailyGoals)
    .where(eq(dailyGoals.isActive, true))
    .orderBy(dailyGoals.orderIndex);
}

export async function getTodayGoalCompletions() {
  const today = format(new Date(), "yyyy-MM-dd");
  const goals = await getGoals();
  const completions = await db
    .select()
    .from(goalCompletions)
    .where(eq(goalCompletions.date, today));

  const completionMap = new Map(
    completions.map((c) => [c.goalId, c.completed])
  );

  return goals.map((g) => ({
    ...g,
    completed: completionMap.get(g.id) ?? false,
  }));
}

export async function toggleGoalCompletion(goalId: number, date?: string) {
  const d = date ?? format(new Date(), "yyyy-MM-dd");

  const existing = await db
    .select()
    .from(goalCompletions)
    .where(
      and(eq(goalCompletions.goalId, goalId), eq(goalCompletions.date, d))
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(goalCompletions)
      .set({ completed: !existing[0].completed })
      .where(
        and(eq(goalCompletions.goalId, goalId), eq(goalCompletions.date, d))
      );
  } else {
    await db
      .insert(goalCompletions)
      .values({ goalId, date: d, completed: true });
  }

  revalidatePath("/");
  revalidatePath("/goals");
}

export async function addGoal(data: {
  title: string;
  category?: string;
  emoji?: string;
}) {
  const existing = await getGoals();
  await db.insert(dailyGoals).values({
    title: data.title,
    category: data.category ?? "general",
    emoji: data.emoji ?? "✓",
    orderIndex: existing.length,
  });
  revalidatePath("/goals");
}

export async function deleteGoal(id: number) {
  await db.update(dailyGoals).set({ isActive: false }).where(eq(dailyGoals.id, id));
  revalidatePath("/goals");
}
