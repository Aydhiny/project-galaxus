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

export interface NotificationPrefs {
  notifyPrayerReminders: boolean;
  notifyPrayerMinutesBefore: number;
  notifyDailyCheckin: boolean;
  notifyDailyCheckinHour: number;
  notifyWeeklyDigest: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  notifyPrayerReminders: true,
  notifyPrayerMinutesBefore: 10,
  notifyDailyCheckin: true,
  notifyDailyCheckinHour: 20,
  notifyWeeklyDigest: true,
};

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const userId = await requireUserId();
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_PREFS;
    return {
      notifyPrayerReminders: row.notifyPrayerReminders ?? DEFAULT_PREFS.notifyPrayerReminders,
      notifyPrayerMinutesBefore: row.notifyPrayerMinutesBefore ?? DEFAULT_PREFS.notifyPrayerMinutesBefore,
      notifyDailyCheckin: row.notifyDailyCheckin ?? DEFAULT_PREFS.notifyDailyCheckin,
      notifyDailyCheckinHour: row.notifyDailyCheckinHour ?? DEFAULT_PREFS.notifyDailyCheckinHour,
      notifyWeeklyDigest: row.notifyWeeklyDigest ?? DEFAULT_PREFS.notifyWeeklyDigest,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  const userId = await requireUserId();
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (rows[0]) {
    await db.update(userSettings).set({ ...prefs, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({ userId, ...prefs });
  }
  revalidatePath("/settings");
}
