import { getTodayCheckin, getStreaks } from "@/lib/actions/checkin";
import { getMonthlyReadingStats } from "@/lib/actions/books";
import { getTodayGoalCompletions } from "@/lib/actions/goals";
import { FeedClient } from "./feed-client";
import { format } from "date-fns";

// ─── Large video pool — shuffled server-side on each render ───────────────────
const VIDEO_POOL = [
  { id: "OLQRAMZi--c", title: "How to Increase Motivation & Drive", channel: "Huberman Lab · 2025" },
  { id: "5j3S2ZuiJfc", title: "Get Up and Get It Done in 2025",    channel: "David Goggins · Jun 2025" },
  { id: "uZaUrI5SwUA", title: "Master Yourself, Master Your Reality", channel: "David Goggins" },
  { id: "GrhLT9P61Z8", title: "Improve Motivation via Dopamine",   channel: "Andrew Huberman" },
  { id: "2GFG_8ns5aU", title: "2025 Go Hard Mindset",              channel: "David Goggins · Jan 2025" },
  { id: "SBYvuAtaUtA", title: "You Owe It to You in 2025",         channel: "David Goggins" },
  { id: "iHeCngdrjHQ", title: "Transform Your Life in 2025",       channel: "David Goggins" },
  { id: "4-Hp9djSUQo", title: "2025: No More Excuses",             channel: "David Goggins" },
  { id: "II1TOaSoOf8", title: "Focus on Yourself — Not Others",    channel: "David Goggins" },
  { id: "1sv1MhwH2q8", title: "Inner Strength & Discipline",       channel: "David Goggins" },
  { id: "jrIS_RQJmCU", title: "This Simple Skill Keeps You Motivated", channel: "Andrew Huberman" },
  { id: "MdO9evu1mVQ", title: "Huberman Morning Routine — Real Life", channel: "Self-Improvement" },
  { id: "KXm5-KUu_7M", title: "Epic Workout Motivation — Goggins Compilation", channel: "David Goggins" },
  { id: "4CoRg96O_y0", title: "40Hz Deep Study Binaural Beats",    channel: "Focus · 2025" },
  { id: "ScSh9gxOrA0", title: "Deep Focus Study — Gamma Waves",    channel: "Focus · Nov 2025" },
];

const QUOTES = [
  { text: "The strong man is not the one who can wrestle, but the one who controls himself when angry.", source: "Prophet Muhammad ﷺ" },
  { text: "We are what we repeatedly do. Excellence is not an act, but a habit.", source: "Aristotle" },
  { text: "Do not lose hope, nor be sad.", source: "Quran 3:139" },
  { text: "Hard work beats talent when talent doesn't work hard.", source: "Tim Notke" },
  { text: "For indeed, with hardship will be ease.", source: "Quran 94:5" },
  { text: "And whoever relies upon Allah — then He is sufficient for him.", source: "Quran 65:3" },
  { text: "Discipline is the bridge between goals and accomplishment.", source: "Jim Rohn" },
  { text: "Allah does not burden a soul beyond that it can bear.", source: "Quran 2:286" },
  { text: "Verily, with hardship comes ease.", source: "Quran 94:6" },
  { text: "Your time is limited — don't waste it living someone else's life.", source: "Steve Jobs" },
  { text: "The secret of getting ahead is getting started.", source: "Mark Twain" },
  { text: "Take care of your body. It's the only place you have to live.", source: "Jim Rohn" },
  { text: "You don't have to be great to start, but you have to start to be great.", source: "Zig Ziglar" },
  { text: "Seek knowledge from the cradle to the grave.", source: "Prophet Muhammad ﷺ" },
];

// Fisher-Yates shuffle — runs on the server so each page load is different
function serverShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function FeedPage() {
  const [checkin, streaks, readingStats, goals] = await Promise.all([
    getTodayCheckin(),
    getStreaks(),
    getMonthlyReadingStats(),
    getTodayGoalCompletions(),
  ]);

  const dayIndex = new Date().getDay();
  const quote = QUOTES[dayIndex % QUOTES.length];
  const dateStr = format(new Date(), "EEEE, MMMM d");
  const completedGoals = goals.filter((g) => g.completed).length;
  const prayersDone =
    (checkin?.fajr ? 1 : 0) + (checkin?.dhuhr ? 1 : 0) +
    (checkin?.asr ? 1 : 0) + (checkin?.maghrib ? 1 : 0) +
    (checkin?.isha ? 1 : 0);

  return (
    <FeedClient
      quote={quote}
      dateStr={dateStr}
      streaks={streaks}
      prayersDone={prayersDone}
      completedGoals={completedGoals}
      totalGoals={goals.length}
      readingStats={readingStats}
    />
  );
}
