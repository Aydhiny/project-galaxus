"use server";

import { db } from "@/lib/db";
import { dailyGoals, goalCompletions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { requireUserId } from "@/lib/auth-session";

export async function getGoals() {
  try {
    const userId = await requireUserId();
    return await db
      .select()
      .from(dailyGoals)
      .where(and(eq(dailyGoals.userId, userId), eq(dailyGoals.isActive, true)))
      .orderBy(dailyGoals.orderIndex);
  } catch {
    return [];
  }
}

export async function getTodayGoalCompletions() {
  try {
    const userId = await requireUserId();
    const today = format(new Date(), "yyyy-MM-dd");
    const goals = await getGoals();
    const completions = await db
      .select()
      .from(goalCompletions)
      .where(and(eq(goalCompletions.userId, userId), eq(goalCompletions.date, today)));

    const completionMap = new Map(
      completions.map((c) => [c.goalId, c.completed])
    );

    return goals.map((g) => ({
      ...g,
      completed: completionMap.get(g.id) ?? false,
    }));
  } catch {
    return [];
  }
}

export async function toggleGoalCompletion(goalId: number, date?: string) {
  const userId = await requireUserId();
  const d = date ?? format(new Date(), "yyyy-MM-dd");

  // Ownership check — refuse to touch a goal that isn't this user's.
  const goal = await db.select().from(dailyGoals).where(and(eq(dailyGoals.id, goalId), eq(dailyGoals.userId, userId))).limit(1);
  if (!goal[0]) return;

  const existing = await db
    .select()
    .from(goalCompletions)
    .where(
      and(eq(goalCompletions.userId, userId), eq(goalCompletions.goalId, goalId), eq(goalCompletions.date, d))
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(goalCompletions)
      .set({ completed: !existing[0].completed })
      .where(
        and(eq(goalCompletions.userId, userId), eq(goalCompletions.goalId, goalId), eq(goalCompletions.date, d))
      );
  } else {
    await db
      .insert(goalCompletions)
      .values({ userId, goalId, date: d, completed: true });
  }

  revalidatePath("/");
  revalidatePath("/goals");
}

export async function addGoal(data: {
  title: string;
  category?: string;
  emoji?: string;
}) {
  const userId = await requireUserId();
  const existing = await getGoals();
  await db.insert(dailyGoals).values({
    userId,
    title: data.title,
    category: data.category ?? "general",
    emoji: data.emoji ?? "✓",
    orderIndex: existing.length,
  });
  revalidatePath("/goals");
}

export async function deleteGoal(id: number) {
  const userId = await requireUserId();
  await db.update(dailyGoals).set({ isActive: false }).where(and(eq(dailyGoals.id, id), eq(dailyGoals.userId, userId)));
  revalidatePath("/goals");
}
