// Pure rules for the living city (week mood, ruins, contest score) — no DB, easy to reason about.
// The sky itself is REAL weather now (lib/weather.ts); your week is a separate mood.

import type { SkyNow } from "@/lib/weather";
export type { SkyNow, Weather } from "@/lib/weather";
export type WeekMood = "sun" | "clouds" | "rain";

export type WorldEvent = {
  id: string; // stable, so the client animates each real event exactly once
  type: "mail" | "reply" | "money" | "hotgig" | "job";
  at: string;
  label: string;
  amount?: number; // money, in KM
  source?: string; // money: client | retainer | gig | beat | stripe | other
  target?: string; // building id a job's result goes to
};

export type Airship = { id: number; title: string; kind: string; deadline: string | null; score: number; summary?: string | null; url?: string; prize?: string | null; location?: string | null };
export type GoalSite = { id: number; title: string; emoji: string | null; progress: number; done: boolean };

export type World = {
  weather: SkyNow; // the real sky over your city (Open-Meteo)
  week: { kind: WeekMood; score: number; why: string }; // how your week went (habits) — shown as a chip, not as rain
  ops: { agents: number; working: number; waiting: number } | null; // the agent facility outside town
  streak: number;
  gold: number; // 0–1, how full the vault is this month
  goals: GoalSite[];
  neglected: string[]; // building ids untouched for 14+ days
  events: WorldEvent[];
  airships: Airship[];
  radarScanning: boolean;
  distracted: boolean; // 20+ min of doomscrolling just now (desktop app) → fog
  citizens: Citizen[];
  sky: { key: string; label: string; level: number }[]; // one constellation per skill
  season: Season;
};

/** A routine, walking the city as a person. */
export type Citizen = { id: number; name: string; streak: number; doneToday: boolean; sad: boolean };
export type Season = { kind: "spring" | "summer" | "autumn" | "winter"; ramadan: boolean; eid: boolean };

/** Season from the real date (northern hemisphere), Ramadan / Eid from the Islamic calendar. */
export function seasonFor(d = new Date()): Season {
  const m = d.getMonth();
  const kind = m === 11 || m <= 1 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
  let hm = 0, hd = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic", { month: "numeric", day: "numeric" }).formatToParts(d);
    hm = Number(parts.find((p) => p.type === "month")?.value);
    hd = Number(parts.find((p) => p.type === "day")?.value);
  } catch { /* no Islamic calendar support → no Ramadan mode */ }
  return { kind, ramadan: hm === 9, eid: (hm === 10 && hd <= 3) || (hm === 12 && hd >= 10 && hd <= 13) };
}

/** Consecutive scheduled days done, counting back from today (today only counts once it's done). */
export function routineStreak(days: string, doneDates: Set<string>, today: Date): { streak: number; doneToday: boolean; missedYesterday: boolean } {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const scheduled = (d: Date) => days[(d.getUTCDay() + 6) % 7] === "1";
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const doneToday = doneDates.has(key(t));
  let streak = doneToday ? 1 : 0;
  let missedYesterday = false;
  const d = new Date(t);
  for (let i = 0; i < 120; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (!scheduled(d)) continue;
    if (doneDates.has(key(d))) streak++;
    else { if (streak === (doneToday ? 1 : 0)) missedYesterday = true; break; }
  }
  return { streak, doneToday, missedYesterday };
}

/**
 * Your week as a mood (it used to drive the sky; the sky is real weather now). Only the habits you actually track count (someone who
 * never logs prayers isn't punished for it). Empty days pull hardest: 3+ days
 * without anything done means rain.
 */
export function weatherFor(week: { tasksDone: number; prayers: number; tracksPrayers: boolean; activeDays: number; days: number }) {
  const parts: number[] = [Math.min(1, week.tasksDone / 14)];
  if (week.tracksPrayers) parts.push(Math.min(1, week.prayers / 30));
  parts.push(week.activeDays / week.days);
  const score = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
  const missed = week.days - week.activeDays;
  const kind: WeekMood = missed >= 3 || score < 35 ? "rain" : score < 65 ? "clouds" : "sun";
  const why = kind === "sun" ? `Strong week — ${week.tasksDone} tasks done` : kind === "clouds" ? `Mixed week — ${week.tasksDone} tasks, ${missed} quiet day${missed === 1 ? "" : "s"}` : `${missed} days without progress — one small win clears the sky`;
  return { kind, score, why };
}

/** A building turns to ruins after this many days without its activity (only if you ever used it). */
export const RUIN_DAYS = 14;
export function isNeglected(last: Date | null, now = new Date()) {
  return !!last && now.getTime() - last.getTime() > RUIN_DAYS * 86_400_000;
}

/** Monthly contest: XP gained this month, plus a small bonus for the current streak. */
export const contestScore = (xpGained: number, streak: number) => Math.max(0, xpGained) + Math.min(streak, 31) * 10;

/** Which building a finished Claude job delivers to. */
export function jobTarget(kind: string) {
  return ({ devlog: "studio", playtest: "studio", hooks: "youtube", comment_replies: "youtube", outreach: "outreach", news: "news" } as Record<string, string>)[kind] ?? "hq";
}

// ─── Customization: how your city looks (visitors see it too) ───────────────
export type EmpireStyle = { palette: PaletteKey; ground: GroundKey; flag: string };
export const PALETTES = {
  classic: { label: "Classic", tint: 0xffffff, amount: 0, accent: 0x2f5d9e },
  desert: { label: "Desert", tint: 0xd9b382, amount: 0.38, accent: 0xc2410c },
  nordic: { label: "Nordic", tint: 0xdbe7f3, amount: 0.4, accent: 0x1e3a8a },
  neon: { label: "Neon", tint: 0x2a1b4a, amount: 0.55, accent: 0xff2d95 },
  sakura: { label: "Sakura", tint: 0xf6c6d6, amount: 0.32, accent: 0xdb2777 },
  forest: { label: "Forest", tint: 0x5f7f52, amount: 0.28, accent: 0x14532d },
  ottoman: { label: "Ottoman", tint: 0xe9dcc2, amount: 0.3, accent: 0x0f766e },
} as const;
export type PaletteKey = keyof typeof PALETTES;
export const GROUNDS = {
  grass: { label: "Meadow", inner: 0xa9cf98, outer: 0x6f9e5f, dry: 0xc2c98a, lush: 0x5e9a58 },
  sand: { label: "Desert sand", inner: 0xe6d3a3, outer: 0xd2b77c, dry: 0xf0e2bb, lush: 0xc9a86a },
  snow: { label: "Snowfield", inner: 0xf1f5f9, outer: 0xdde6ee, dry: 0xffffff, lush: 0xcbd5e1 },
  stone: { label: "Stone plaza", inner: 0xb8b2a7, outer: 0x8f8a80, dry: 0xc9c3b8, lush: 0x7d786f },
} as const;
export type GroundKey = keyof typeof GROUNDS;
export const FLAG_COLORS = ["#14b8a6", "#e11d48", "#f59e0b", "#2563eb", "#7c3aed", "#16a34a", "#0f172a", "#ffffff"];
export const DEFAULT_STYLE: EmpireStyle = { palette: "classic", ground: "grass", flag: "#14b8a6" };

/** Anything stored or sent in → a valid style (unknown values fall back to the defaults). */
export function cleanStyle(raw: unknown): EmpireStyle {
  const r = (raw ?? {}) as Partial<EmpireStyle>;
  return {
    palette: r.palette && r.palette in PALETTES ? r.palette : DEFAULT_STYLE.palette,
    ground: r.ground && r.ground in GROUNDS ? r.ground : DEFAULT_STYLE.ground,
    flag: typeof r.flag === "string" && /^#[0-9a-f]{6}$/i.test(r.flag) ? r.flag : DEFAULT_STYLE.flag,
  };
}
