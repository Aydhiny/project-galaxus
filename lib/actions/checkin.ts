"use server";

import { db } from "@/lib/db";
import { dailyCheckins, users, notifications, notifiedAchievements, streakFreezes } from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { format, startOfMonth } from "date-fns";
import { requireUserId } from "@/lib/auth-session";
import { clampHistoryDays, getPlanLimits } from "@/lib/plan";
import { getLeaderboardData } from "@/lib/actions/leaderboard";
import { getAchievements } from "@/lib/achievements";

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
    const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    const cappedDays = clampHistoryDays(user?.plan ?? "free", days);
    const rows = await db
      .select()
      .from(dailyCheckins)
      .where(eq(dailyCheckins.userId, userId))
      .orderBy(dailyCheckins.date);
    return rows.slice(-cappedDays);
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

  await notifyNewlyUnlockedAchievements(userId);
}

/**
 * getAchievements() itself stays pure/derived (see lib/achievements.ts) — this
 * only adds a side-channel dedup ledger so we notify once per unlock, not on
 * every checkin save that happens to still qualify.
 */
async function notifyNewlyUnlockedAchievements(userId: number) {
  const data = await getLeaderboardData();
  const unlocked = getAchievements(data).filter((a) => a.unlocked);
  if (unlocked.length === 0) return;

  const already = await db
    .select({ achievementId: notifiedAchievements.achievementId })
    .from(notifiedAchievements)
    .where(eq(notifiedAchievements.userId, userId));
  const alreadyIds = new Set(already.map((a) => a.achievementId));

  for (const a of unlocked) {
    if (alreadyIds.has(a.id)) continue;
    await db.insert(notifiedAchievements).values({ userId, achievementId: a.id }).onConflictDoNothing();
    await db.insert(notifications).values({
      userId,
      type: "achievement",
      title: `Achievement unlocked: ${a.label}`,
      body: a.description,
    });
  }
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

const HABIT_LABELS: Record<string, string> = {
  training: "Training", meditation: "Meditation", music: "Music",
  writing: "Writing", gratitude: "Gratitude", prayers: "Prayer",
};

/**
 * Checks whether `date`'s gap in `habitField`'s streak should be forgiven.
 * Freezes aren't a stored balance — "used this month" is a computed count of
 * rows created since the start of the current calendar month, so there's
 * nothing to reset or that can drift out of sync (see lib/db/schema.ts).
 * Idempotent: re-checking an already-frozen date finds the existing row and
 * doesn't re-notify or double-spend.
 */
async function tryApplyFreeze(userId: number, plan: string, habitField: string, date: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(streakFreezes)
    .where(and(eq(streakFreezes.userId, userId), eq(streakFreezes.habitField, habitField), eq(streakFreezes.coveredDate, date)))
    .limit(1);
  if (existing[0]) return true;

  const { streakFreezesPerMonth } = getPlanLimits(plan);
  if (streakFreezesPerMonth <= 0) return false;

  const monthStart = startOfMonth(new Date());
  const usedThisMonth = await db
    .select()
    .from(streakFreezes)
    .where(and(eq(streakFreezes.userId, userId), gte(streakFreezes.createdAt, monthStart)));
  if (usedThisMonth.length >= streakFreezesPerMonth) return false;

  await db.insert(streakFreezes).values({ userId, habitField, coveredDate: date });
  await db.insert(notifications).values({
    userId,
    type: "streak_freeze",
    title: "Streak freeze applied",
    body: `Your ${HABIT_LABELS[habitField] ?? habitField} streak was protected for ${date}.`,
  });
  return true;
}

export async function getStreaks() {
  try {
    const userId = await requireUserId();
    const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    const plan = user?.plan ?? "free";

    const rows = await db
      .select()
      .from(dailyCheckins)
      .where(eq(dailyCheckins.userId, userId))
      .orderBy(dailyCheckins.date);

    const sorted = [...rows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    async function calcStreak(field: keyof (typeof sorted)[0], habitField: string) {
      let s = 0;
      for (const row of sorted) {
        if (row[field] === true) { s++; continue; }
        if (await tryApplyFreeze(userId, plan, habitField, row.date)) { s++; continue; }
        break;
      }
      return s;
    }

    async function calcPrayerStreak() {
      let s = 0;
      for (const row of sorted) {
        const allFive = row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha;
        if (allFive) { s++; continue; }
        if (await tryApplyFreeze(userId, plan, "prayers", row.date)) { s++; continue; }
        break;
      }
      return s;
    }

    return {
      training: await calcStreak("training", "training"),
      meditation: await calcStreak("meditation", "meditation"),
      music: await calcStreak("music", "music"),
      writing: await calcStreak("writing", "writing"),
      gratitude: await calcStreak("gratitude", "gratitude"),
      prayers: await calcPrayerStreak(),
    };
  } catch {
    return { training: 0, meditation: 0, music: 0, writing: 0, gratitude: 0, prayers: 0 };
  }
}

export async function getFreezeStatus() {
  try {
    const userId = await requireUserId();
    const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    const plan = user?.plan ?? "free";
    const { streakFreezesPerMonth } = getPlanLimits(plan);

    const monthStart = startOfMonth(new Date());
    const usedThisMonth = await db
      .select()
      .from(streakFreezes)
      .where(and(eq(streakFreezes.userId, userId), gte(streakFreezes.createdAt, monthStart)));

    return { used: usedThisMonth.length, allowance: streakFreezesPerMonth };
  } catch {
    return { used: 0, allowance: 0 };
  }
}
