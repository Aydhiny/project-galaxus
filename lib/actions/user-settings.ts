"use server";

import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

export async function getDashboardFocus(): Promise<string> {
  try {
    const rows = await db.select().from(userSettings).limit(1);
    return rows[0]?.dashboardFocus ?? "";
  } catch {
    return "";
  }
}

export async function saveDashboardFocus(text: string): Promise<void> {
  try {
    const rows = await db.select().from(userSettings).limit(1);
    if (rows[0]) {
      await db.update(userSettings).set({ dashboardFocus: text, updatedAt: new Date() });
    } else {
      await db.insert(userSettings).values({ dashboardFocus: text });
    }
    revalidatePath("/dashboard");
  } catch {
    /* ignore — best effort */
  }
}
