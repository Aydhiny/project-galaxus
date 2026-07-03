"use server";

import { db } from "@/lib/db";
import { dailyCheckins } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { requireUserId } from "@/lib/auth-session";

export async function getTodayCheckin() {
  try {
    const userId = await requireUserId();
    const today = format(new Date(), "yyyy-MM-dd");
    const rows = await db
      .select()
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, today)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function getCheckinByDate(date: string) {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRecentCheckins(days = 30) {
  try {
    const userId = await requireUserId();
    const rows = await db
      .select()
      .from(dailyCheckins)
      .where(eq(dailyCheckins.userId, userId))
      .orderBy(dailyCheckins.date);
    return rows.slice(-days);
  } catch {
    return [];
  }
}

export async function upsertCheckin(
  date: string,
  data: Partial<typeof dailyCheckins.$inferInsert>
) {
  const userId = await requireUserId();
  const existing = await db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, date)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(dailyCheckins)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, date)));
  } else {
    await db.insert(dailyCheckins).values({ userId, date, ...data });
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/daily");
  revalidatePath("/spiritual");
  revalidatePath("/training");
  revalidatePath("/overview");
}

export async function calculateStreak(field: keyof typeof dailyCheckins.$inferSelect) {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(dailyCheckins)
    .where(eq(dailyCheckins.userId, userId))
    .orderBy(dailyCheckins.date);

  let streak = 0;

  const sorted = [...rows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const row of sorted) {
    const val = row[field as keyof typeof row];
    if (val === true) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export async function getStreaks() {
  try {
    const userId = await requireUserId();
    const rows = await db
      .select()
      .from(dailyCheckins)
      .where(eq(dailyCheckins.userId, userId))
      .orderBy(dailyCheckins.date);

    const sorted = [...rows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    function calcStreak(field: keyof (typeof sorted)[0]) {
      let s = 0;
      for (const row of sorted) {
        if (row[field] === true) s++;
        else break;
      }
      return s;
    }

    return {
      training: calcStreak("training"),
      meditation: calcStreak("meditation"),
      music: calcStreak("music"),
      writing: calcStreak("writing"),
      gratitude: calcStreak("gratitude"),
      prayers: getPrayerStreak(sorted),
    };
  } catch {
    return { training: 0, meditation: 0, music: 0, writing: 0, gratitude: 0, prayers: 0 };
  }
}

function getPrayerStreak(sorted: (typeof dailyCheckins.$inferSelect)[]) {
  let s = 0;
  for (const row of sorted) {
    const allFive =
      row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha;
    if (allFive) s++;
    else break;
  }
  return s;
}
