"use server";

import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getNotifications() {
  try {
    const userId = await requireUserId();
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const userId = await requireUserId();
    const [row] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function markRead(id: number) {
  const userId = await requireUserId();
  // The userId check here is load-bearing, not a formality — without it one
  // user could mark another user's notification read by guessing an id.
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  revalidatePath("/dashboard");
}

export async function markAllRead() {
  const userId = await requireUserId();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  revalidatePath("/dashboard");
}
