// Pure rules for the living city (weather, ruins, contest score) — no DB, easy to reason about.

export type Weather = "sun" | "clouds" | "rain";

export type WorldEvent = {
  id: string; // stable, so the client animates each real event exactly once
  type: "mail" | "reply" | "money" | "hotgig" | "job";
  at: string;
  label: string;
  amount?: number; // money, in KM
  source?: string; // money: client | retainer | gig | beat | stripe | other
  target?: string; // building id a job's result goes to
};

export type Airship = { id: number; title: string; kind: string; deadline: string | null; score: number };
export type GoalSite = { id: number; title: string; emoji: string | null; progress: number; done: boolean };

export type World = {
  weather: { kind: Weather; score: number; why: string };
  streak: number;
  gold: number; // 0–1, how full the vault is this month
  goals: GoalSite[];
  neglected: string[]; // building ids untouched for 14+ days
  events: WorldEvent[];
  airships: Airship[];
  radarScanning: boolean;
  distracted: boolean; // 20+ min of doomscrolling just now (desktop app) → fog
};

/**
 * Your week as weather. Only the habits you actually track count (someone who
 * never logs prayers isn't punished for it). Empty days pull hardest: 3+ days
 * without anything done means rain.
 */
export function weatherFor(week: { tasksDone: number; prayers: number; tracksPrayers: boolean; activeDays: number; days: number }) {
  const parts: number[] = [Math.min(1, week.tasksDone / 14)];
  if (week.tracksPrayers) parts.push(Math.min(1, week.prayers / 30));
  parts.push(week.activeDays / week.days);
  const score = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
  const missed = week.days - week.activeDays;
  const kind: Weather = missed >= 3 || score < 35 ? "rain" : score < 65 ? "clouds" : "sun";
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
