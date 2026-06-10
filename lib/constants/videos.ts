export interface FeedVideo {
  id: string;
  title: string;
  channel: string;
}

// Large verified pool — shuffled client-side per session
export const VIDEO_POOL: FeedVideo[] = [
  { id: "OLQRAMZi--c", title: "How to Increase Motivation & Drive",         channel: "Huberman Lab · 2025" },
  { id: "5j3S2ZuiJfc", title: "Get Up and Get It Done in 2025",              channel: "David Goggins · Jun 2025" },
  { id: "uZaUrI5SwUA", title: "Master Yourself, Master Your Reality",         channel: "David Goggins" },
  { id: "GrhLT9P61Z8", title: "Improve Motivation via Dopamine",              channel: "Andrew Huberman" },
  { id: "2GFG_8ns5aU", title: "2025 Go Hard Mindset",                         channel: "David Goggins · Jan 2025" },
  { id: "SBYvuAtaUtA", title: "You Owe It to You in 2025",                    channel: "David Goggins" },
  { id: "iHeCngdrjHQ", title: "Transform Your Life in 2025",                  channel: "David Goggins" },
  { id: "4-Hp9djSUQo", title: "2025: No More Excuses",                        channel: "David Goggins" },
  { id: "II1TOaSoOf8", title: "Focus on Yourself — Discipline Yourself",       channel: "David Goggins" },
  { id: "1sv1MhwH2q8", title: "Inner Strength & Discipline",                   channel: "David Goggins" },
  { id: "jrIS_RQJmCU", title: "This Simple Skill Keeps You Motivated",         channel: "Andrew Huberman" },
  { id: "MdO9evu1mVQ", title: "Huberman Morning Routine — Real Life",          channel: "Self-Improvement" },
  { id: "KXm5-KUu_7M", title: "Epic Workout Motivation — Goggins Compilation", channel: "David Goggins" },
  { id: "4CoRg96O_y0", title: "40Hz Deep Study Binaural Beats",               channel: "Focus · 2025" },
  { id: "ScSh9gxOrA0", title: "Deep Focus Study — Gamma Waves",               channel: "Focus · Nov 2025" },
  { id: "X_ksX8wxnkU", title: "40Hz Gamma — Distraction-Free Work & Study",   channel: "Focus Mode · 2026" },
  { id: "7Kdc95rNQlc", title: "Instant Deep Work Mode — 40Hz Gamma Waves",    channel: "Gamma Focus Flow · 2026" },
];

export function pickRandomVideos(n = 4): FeedVideo[] {
  const pool = [...VIDEO_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
