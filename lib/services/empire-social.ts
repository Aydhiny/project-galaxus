// Visiting other empires + the monthly city contest.
//
// Like the global leaderboard, this deliberately reads across users — but
// only users who opted in (user_settings.empire_public), and only aggregates:
// building levels, on/off, weather, streak, goal progress as a number. Never
// names of goals, deals, emails, diary text, money amounts or anything typed.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { empireSnapshots, userSettings, users } from "@/lib/db/schema";
import { contestScore } from "@/lib/empire-world";
import { empireFor, type Building } from "@/lib/services/empire";
import { hudFor } from "@/lib/services/hud";

const month = () => new Date().toISOString().slice(0, 7);
const firstName = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 20) || "Citizen";

export async function empireSharingFor(userId: number) {
  const [s] = await db.select({ pub: userSettings.empirePublic, city: userSettings.cityName }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return { isPublic: !!s?.pub, cityName: s?.city ?? null };
}

export async function saveEmpireSharingFor(userId: number, input: { isPublic: boolean; cityName: string | null }) {
  const city = input.cityName?.replace(/[^\p{L}\p{N} '\-]/gu, "").trim().slice(0, 40) || null;
  const set = { empirePublic: input.isPublic, cityName: city, updatedAt: new Date() };
  await db.insert(userSettings).values({ userId, ...set }).onConflictDoUpdate({ target: userSettings.userId, set });
}

/** XP at the start of this month (taken the first time we see you this month). */
async function monthStartXp(userId: number, xpNow: number) {
  const m = month();
  const [row] = await db.select().from(empireSnapshots).where(and(eq(empireSnapshots.userId, userId), eq(empireSnapshots.month, m))).limit(1);
  if (row) return row.xpStart;
  await db.insert(empireSnapshots).values({ userId, month: m, xpStart: xpNow }).onConflictDoNothing();
  return xpNow;
}

export type PublicCity = {
  userId: number; name: string; level: number; rank: string; streak: number; xpGained: number; score: number; isSelf: boolean;
};

/** Everyone who shares their city, ranked for this month's contest. */
export async function worldListFor(viewerId: number) {
  const rows = await db.select({ id: users.id, name: users.name, city: userSettings.cityName }).from(userSettings)
    .innerJoin(users, eq(users.id, userSettings.userId)).where(eq(userSettings.empirePublic, true)).limit(60);
  const cities: PublicCity[] = [];
  for (const r of rows) {
    const hud = await hudFor(r.id);
    const start = await monthStartXp(r.id, hud.xp);
    const gained = hud.xp - start;
    cities.push({ userId: r.id, name: r.city || `${firstName(r.name)}'s city`, level: hud.level, rank: hud.rank, streak: hud.streak, xpGained: gained, score: contestScore(gained, hud.streak), isSelf: r.id === viewerId });
  }
  // Snapshot the viewer too, so their own score is ready once they opt in.
  if (!cities.some((c) => c.isSelf)) { const h = await hudFor(viewerId); await monthStartXp(viewerId, h.xp); }
  return cities.sort((a, b) => b.score - a.score);
}

/** A shared city for visitors: shapes and levels only, every text field blanked. */
export async function publicEmpireFor(viewerId: number, userId: number) {
  const [s] = await db.select({ pub: userSettings.empirePublic, city: userSettings.cityName, name: users.name }).from(userSettings)
    .innerJoin(users, eq(users.id, userSettings.userId)).where(eq(userSettings.userId, userId)).limit(1);
  if (!s || (!s.pub && userId !== viewerId)) throw new Error("This city isn't shared.");
  const e = await empireFor(userId);
  const buildings: Building[] = e.buildings.map((b) => ({ ...b, status: "", bubbles: [], stats: [{ label: "Level", value: String(b.level) }] }));
  const w = e.world;
  return {
    name: s.city || `${firstName(s.name)}'s city`,
    level: e.level, rank: e.rank, buildings,
    world: {
      ...w,
      goals: w.goals.map((g, i) => ({ ...g, title: `Project ${i + 1}`, emoji: null })),
      events: [], airships: [], gold: Math.round(w.gold * 4) / 4, // coarse: no money amounts leak
      weather: { kind: w.weather.kind, score: 0, why: "" }, distracted: false,
    },
  };
}
export type PublicEmpire = Awaited<ReturnType<typeof publicEmpireFor>>;

export async function isEmpirePublic(userIds: number[]) {
  if (!userIds.length) return new Set<number>();
  const rows = await db.select({ id: userSettings.userId }).from(userSettings).where(and(inArray(userSettings.userId, userIds), eq(userSettings.empirePublic, true)));
  return new Set(rows.map((r) => r.id));
}
