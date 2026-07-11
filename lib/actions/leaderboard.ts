"use server";

import { db } from "@/lib/db";
import { dailyCheckins, users, userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth-session";
import { getAchievements } from "@/lib/achievements";
import { revalidatePath } from "next/cache";
import { deriveLeaderboardData, EMPTY_LEADERBOARD_DATA, type LeaderboardData } from "@/lib/leaderboard-utils";

/**
 * Despite the name, this returns the current user's own stats/streaks —
 * not a cross-user public leaderboard. See getGlobalLeaderboard() below for
 * the opt-in cross-user view.
 */
export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    const userId = await requireUserId();
    const rows = await db.select().from(dailyCheckins).where(eq(dailyCheckins.userId, userId)).orderBy(dailyCheckins.date);
    return deriveLeaderboardData(rows);
  } catch {
    return EMPTY_LEADERBOARD_DATA;
  }
}

const HABIT_LABELS: Record<string, string> = {
  training: "Training", prayers: "Prayers", music: "Creative",
  writing: "Writing", gratitude: "Gratitude", meditation: "Meditation",
};

export interface GlobalLeaderboardEntry {
  rank: number;
  userId: number;
  name: string;
  isSelf: boolean;
  totalDays: number;
  bestOverall: { habit: string; label: string; streak: number };
  badgeCount: number;
}

function bestOverallStreak(data: LeaderboardData): { habit: string; label: string; streak: number } {
  const entries = Object.entries(data.bestStreaks) as [string, { streak: number }][];
  const top = entries.reduce((a, b) => (b[1].streak > a[1].streak ? b : a));
  return { habit: top[0], label: HABIT_LABELS[top[0]] ?? top[0], streak: top[1].streak };
}

/**
 * The one place in this app that intentionally reads across users rather
 * than scoping a query to the caller — every other query here is
 * tenant-isolated by design. This is deliberate and narrow: only users who
 * explicitly opted in (user_settings.leaderboard_opt_in) are ever included,
 * and only their id/name/derived stats are selected — no email, no raw
 * checkin content.
 */
export async function getGlobalLeaderboard(): Promise<{ entries: GlobalLeaderboardEntry[]; viewerEntry: GlobalLeaderboardEntry | null }> {
  const viewerId = await requireUserId();

  const optedIn = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(userSettings.leaderboardOptIn, true));

  const ranked: GlobalLeaderboardEntry[] = [];
  for (const u of optedIn) {
    const rows = await db.select().from(dailyCheckins).where(eq(dailyCheckins.userId, u.id)).orderBy(dailyCheckins.date);
    const data = deriveLeaderboardData(rows);
    if (data.totalDays === 0) continue; // no data yet — nothing to rank
    ranked.push({
      rank: 0, // assigned after sort
      userId: u.id,
      name: u.name,
      isSelf: u.id === viewerId,
      totalDays: data.totalDays,
      bestOverall: bestOverallStreak(data),
      badgeCount: getAchievements(data).filter((a) => a.unlocked).length,
    });
  }

  ranked.sort((a, b) => b.totalDays - a.totalDays);
  ranked.forEach((e, i) => { e.rank = i + 1; });

  const top20 = ranked.slice(0, 20);
  const viewerEntry = ranked.find((e) => e.isSelf) ?? null;

  return { entries: top20, viewerEntry };
}

export async function getLeaderboardOptIn(): Promise<boolean> {
  try {
    const userId = await requireUserId();
    const [row] = await db.select({ leaderboardOptIn: userSettings.leaderboardOptIn }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return row?.leaderboardOptIn ?? false;
  } catch {
    return false;
  }
}

export async function setLeaderboardOptIn(enabled: boolean): Promise<void> {
  const userId = await requireUserId();
  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (existing) {
    await db.update(userSettings).set({ leaderboardOptIn: enabled, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({ userId, leaderboardOptIn: enabled });
  }
  revalidatePath("/leaderboard");
  revalidatePath("/settings");
}
