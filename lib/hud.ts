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
  tasksDone: number; checkinDays: number; streak: number;
  outreachSent: number; outreachReplies: number; clients: number; gigsApplied: number; earnedKm: number;
  gameCommits: number; webClients: number;
  videos: number; shorts: number; views: number; youtubeDays: number;
  beatsFinished: number; beatsSold: number; musicMinutes: number;
  trainingDays: number; trainingMinutes: number; records: number;
  prayers: number; quranPages: number;
  pagesRead: number; booksDone: number; studyHours: number; coursesDone: number; meditationMinutes: number; journalEntries: number;
};

export const SKILLS = [
  { key: "discipline", label: "Discipline", emoji: "🎯", tone: "amber",
    how: "10 XP per finished task · 5 per daily check-in · streak bonus",
    xp: (c: SkillCounts) => c.tasksDone * 10 + c.checkinDays * 5 + Math.min(c.streak, 60) * 5 },
  { key: "hustle", label: "Hustle", emoji: "💼", tone: "emerald",
    how: "3 XP per outreach sent · 15 per reply · 25 per gig applied · 250 per client · ½ per KM earned",
    xp: (c: SkillCounts) => c.outreachSent * 3 + c.outreachReplies * 15 + c.gigsApplied * 25 + c.clients * 250 + c.earnedKm * 0.5 },
  { key: "coding", label: "Coding", emoji: "💻", tone: "sky",
    how: "8 XP per game commit · 150 per website client",
    xp: (c: SkillCounts) => c.gameCommits * 8 + c.webClients * 150 },
  { key: "editing", label: "Editing", emoji: "🎬", tone: "rose",
    how: "40 XP per video · 20 per Short · 5 per 1,000 views · 10 per YouTube day",
    xp: (c: SkillCounts) => c.videos * 40 + c.shorts * 20 + (c.views / 1000) * 5 + c.youtubeDays * 10 },
  { key: "music", label: "Music", emoji: "🎧", tone: "violet",
    how: "30 XP per finished beat · 100 per sale · 1 per 10 minutes producing",
    xp: (c: SkillCounts) => c.beatsFinished * 30 + c.beatsSold * 100 + c.musicMinutes / 10 },
  { key: "fitness", label: "Fitness", emoji: "💪", tone: "orange",
    how: "10 XP per training day · 1 per 10 minutes · 25 per personal record",
    xp: (c: SkillCounts) => c.trainingDays * 10 + c.trainingMinutes / 10 + c.records * 25 },
  { key: "faith", label: "Faith", emoji: "🕌", tone: "teal",
    how: "2 XP per prayer · 1 per Qur'an page",
    xp: (c: SkillCounts) => c.prayers * 2 + c.quranPages },
  { key: "mind", label: "Mind", emoji: "📚", tone: "indigo",
    how: "½ XP per page read · 100 per book · 10 per study hour · 150 per course · 1 per 5 min meditation · 5 per journal entry",
    xp: (c: SkillCounts) => c.pagesRead * 0.5 + c.booksDone * 100 + c.studyHours * 10 + c.coursesDone * 150 + c.meditationMinutes / 5 + c.journalEntries * 5 },
] as const;
export type SkillKey = (typeof SKILLS)[number]["key"];

/** Skills level faster than the overall level (a gentler curve). */
export function skillLevels(c: SkillCounts) {
  const skills = SKILLS.map((s) => {
    const xp = Math.round(s.xp(c));
    return { key: s.key, label: s.label, emoji: s.emoji, tone: s.tone, how: s.how, xp, ...levelFor(xp, 50, 25) };
  });
  const total = skills.reduce((sum, s) => sum + s.xp, 0);
  return { skills, totalXp: total, ...levelFor(total), rank: "" as string };
}
