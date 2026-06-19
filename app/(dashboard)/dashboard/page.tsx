import { getTodayCheckin, getStreaks } from "@/lib/actions/checkin";
import { getMonthlyReadingStats } from "@/lib/actions/books";
import { getTodayGoalCompletions } from "@/lib/actions/goals";
import { getDashboardFocus } from "@/lib/actions/user-settings";
import { FeedClient } from "./feed-client";
import { format } from "date-fns";

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

export default async function FeedPage() {
  const [checkin, streaks, readingStats, goals, focusText] = await Promise.all([
    getTodayCheckin(),
    getStreaks(),
    getMonthlyReadingStats(),
    getTodayGoalCompletions(),
    getDashboardFocus(),
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
      focusText={focusText}
    />
  );
}
