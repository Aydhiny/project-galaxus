// The HUD's game layer — pure, tested in hud.test.ts. XP comes from real
// things you did: finished tasks, applied gigs, money earned.

export const XP = { task: 10, gigApplied: 25, clientWon: 250, perKm: 0.5 } as const;

/** Level curve: each level needs a bit more than the last (100, 250, 450, 700 …). */
export function levelFor(xp: number): { level: number; into: number; need: number; progress: number } {
  let level = 1;
  let floor = 0;
  let step = 100;
  while (xp >= floor + step) {
    floor += step;
    level++;
    step = 100 + (level - 1) * 50;
  }
  const into = xp - floor;
  return { level, into, need: step, progress: Math.round((into / step) * 100) };
}

export function xpFrom(c: { tasksDone: number; gigsApplied: number; clients: number; earnedKm: number }): number {
  return Math.round(c.tasksDone * XP.task + c.gigsApplied * XP.gigApplied + c.clients * XP.clientWon + c.earnedKm * XP.perKm);
}

/** Rank titles for the level badge — street-to-boss, but about building things. */
export function rankTitle(level: number): string {
  const ranks = ["Rookie", "Hustler", "Operator", "Builder", "Closer", "Founder", "Mogul", "Legend"];
  return ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 3))];
}
