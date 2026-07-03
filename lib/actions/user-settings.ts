"use server";

import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";

export async function getDashboardFocus(): Promise<string> {
  try {
    const userId = await requireUserId();
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return rows[0]?.dashboardFocus ?? "";
  } catch {
    return "";
  }
}

export async function saveDashboardFocus(text: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (rows[0]) {
      await db.update(userSettings).set({ dashboardFocus: text, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({ userId, dashboardFocus: text });
    }
    revalidatePath("/dashboard");
  } catch {
    /* ignore — best effort */
  }
}
