// The game layer — pure, tested in hud.test.ts. Every XP point comes from
// something you really did; nothing is granted for opening the app.

export const XP = { task: 10, gigApplied: 25, clientWon: 250, perKm: 0.5 } as const;

/** Overall level curve: each level needs a bit more than the last (100, 150, 200 …). */
export function levelFor(xp: number, base = 100, growth = 50): { level: number; into: number; need: number; progress: number } {
  let level = 1;
  let floor = 0;
  let step = base;
  while (xp >= floor + step && level < 999) {
    floor += step;
    level++;
    step = base + (level - 1) * growth;
  }
  const into = xp - floor;
  return { level, into, need: step, progress: Math.round((into / step) * 100) };
}

/** Kept for callers that only know the classic counters. */
export function xpFrom(c: { tasksDone: number; gigsApplied: number; clients: number; earnedKm: number }): number {
  return Math.round(c.tasksDone * XP.task + c.gigsApplied * XP.gigApplied + c.clients * XP.clientWon + c.earnedKm * XP.perKm);
}

export function rankTitle(level: number): string {
  const ranks = ["Rookie", "Hustler", "Operator", "Builder", "Closer", "Founder", "Mogul", "Legend"];
  return ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 3))];
}
export const RANKS = ["Rookie", "Hustler", "Operator", "Builder", "Closer", "Founder", "Mogul", "Legend"].map((name, i) => ({ name, fromLevel: i * 3 + 1 }));

// ─── Skills ───────────────────────────────────────────────────────────────────

/** Raw counts gathered from your data (see lib/services/hud.ts). */
export type SkillCounts = {
  tasksDone: number; checkinDays: number; streak: number; focusMinutes: number; goodNights: number; dailyGoalsDone: number;
  // Tasks tagged with an area, and monthly goals achieved per area — feed the matching skill.
  areaTasks: Partial<Record<"training" | "faith" | "reading" | "youtube" | "mind" | "sleep" | "study", number>>;
  areaGoals: Partial<Record<"training" | "faith" | "reading" | "youtube" | "mind" | "sleep" | "study", number>>;
  goalsAchieved: number;
  achievements: number;
  outreachSent: number; outreachReplies: number; clients: number; gigsApplied: number; earnedKm: number;
  gameCommits: number; webClients: number;
  codeMinutes: number; editingMinutes: number; // tracked automatically by the desktop app (deep work)
  videos: number; shorts: number; views: number; youtubeDays: number;
  beatsFinished: number; beatsSold: number; musicMinutes: number;
  trainingDays: number; trainingMinutes: number; records: number;
  prayers: number; quranPages: number;
  pagesRead: number; booksDone: number; studyHours: number; coursesDone: number; meditationMinutes: number; journalEntries: number;
};

export const SKILLS = [
  { key: "discipline", label: "Discipline", emoji: "🎯", tone: "amber",
    how: "6 XP per task · 4 per check-in · 1 per 5 focus minutes · 8 per good night · 2 per daily goal · 100 per monthly goal achieved",
    xp: (c: SkillCounts) => c.tasksDone * 6 + c.checkinDays * 4 + c.focusMinutes / 5 + Math.min(c.streak, 60) * 3 + c.goodNights * 8 + c.dailyGoalsDone * 2
      + (c.areaTasks.sleep ?? 0) * 4 + (c.areaGoals.sleep ?? 0) * 150 + c.goalsAchieved * 100 },
  { key: "hustle", label: "Hustle", emoji: "💼", tone: "emerald",
    how: "2 XP per outreach sent · 10 per reply · 15 per gig applied · 250 per client · 1 per 5 KM earned",
    xp: (c: SkillCounts) => c.outreachSent * 2 + c.outreachReplies * 10 + c.gigsApplied * 15 + c.clients * 250 + c.earnedKm * 0.2 },
  { key: "coding", label: "Coding", emoji: "💻", tone: "sky",
    how: "8 XP per game commit · 150 per website client · 1 per 10 min coding / game dev (desktop app)",
    xp: (c: SkillCounts) => c.gameCommits * 8 + c.webClients * 150 + c.codeMinutes / 10 },
  { key: "editing", label: "Editing", emoji: "🎬", tone: "rose",
    how: "40 XP per video · 20 per Short · 5 per 1,000 views · 10 per YouTube day · 4 per #youtube task · 150 per YouTube goal · 1 per 10 min editing / design (desktop app)",
    xp: (c: SkillCounts) => c.videos * 40 + c.shorts * 20 + (c.views / 1000) * 5 + c.youtubeDays * 10 + (c.areaTasks.youtube ?? 0) * 4 + (c.areaGoals.youtube ?? 0) * 150 + c.editingMinutes / 10 },
  { key: "music", label: "Music", emoji: "🎧", tone: "violet",
    how: "30 XP per finished beat · 100 per sale · 1 per 10 minutes producing (logged or tracked in your DAW)",
    xp: (c: SkillCounts) => c.beatsFinished * 30 + c.beatsSold * 100 + c.musicMinutes / 10 },
  { key: "fitness", label: "Fitness", emoji: "💪", tone: "orange",
    how: "10 XP per training day · 1 per 10 minutes · 25 per personal record · 4 per #training task · 150 per training goal",
    xp: (c: SkillCounts) => c.trainingDays * 10 + c.trainingMinutes / 10 + c.records * 25 + (c.areaTasks.training ?? 0) * 4 + (c.areaGoals.training ?? 0) * 150 },
  { key: "faith", label: "Faith", emoji: "🕌", tone: "teal",
    how: "2 XP per prayer · 1 per Qur'an page · 4 per #faith task · 150 per faith goal",
    xp: (c: SkillCounts) => c.prayers * 2 + c.quranPages + (c.areaTasks.faith ?? 0) * 4 + (c.areaGoals.faith ?? 0) * 150 },
  { key: "mind", label: "Mind", emoji: "📚", tone: "indigo",
    how: "½ XP per page · 100 per book · 10 per study hour · 150 per course · 1 per 5 min meditation · 5 per diary entry · 4 per #reading/#mind/#study task · 150 per goal",
    xp: (c: SkillCounts) => c.pagesRead * 0.5 + c.booksDone * 100 + c.studyHours * 10 + c.coursesDone * 150 + c.meditationMinutes / 5 + c.journalEntries * 5
      + ((c.areaTasks.reading ?? 0) + (c.areaTasks.mind ?? 0) + (c.areaTasks.study ?? 0)) * 4 + ((c.areaGoals.reading ?? 0) + (c.areaGoals.mind ?? 0) + (c.areaGoals.study ?? 0)) * 150 },
] as const;
export type SkillKey = (typeof SKILLS)[number]["key"];

// Steep curves on purpose: levels should mean months of real work, not a week.
export const ACHIEVEMENT_XP = 40;
export const OVERALL_CURVE = { base: 400, growth: 300 } as const; // L2 400 · L3 +700 · L4 +1000 · L5 +1300 …
export const SKILL_CURVE = { base: 120, growth: 90 } as const; //   L2 120 · L3 +210 · L4 +300 …

export function skillLevels(c: SkillCounts) {
  const skills = SKILLS.map((s) => {
    const xp = Math.round(s.xp(c));
    return { key: s.key, label: s.label, emoji: s.emoji, tone: s.tone, how: s.how, xp, ...levelFor(xp, SKILL_CURVE.base, SKILL_CURVE.growth) };
  });
  // Achievements share the same economy: each unlocked badge is worth XP toward your level.
  const achievementXp = c.achievements * ACHIEVEMENT_XP;
  const total = skills.reduce((sum, s) => sum + s.xp, 0) + achievementXp;
  return { skills, achievementXp, totalXp: total, ...levelFor(total, OVERALL_CURVE.base, OVERALL_CURVE.growth), rank: "" as string };
}
