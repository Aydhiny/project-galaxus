"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { FeedClient } from "./feed-client";
import { getLocalStreaks, getLocalTodayRecord } from "@/lib/utils/local-data";

const QUOTES = [
  { text: "The strong man is not the one who can wrestle, but the one who controls himself when angry.", source: "Prophet Muhammad ﷺ" },
  { text: "We are what we repeatedly do. Excellence is not an act, but a habit.", source: "Aristotle" },
  { text: "Do not lose hope, nor be sad.", source: "Quran 3:139" },
  { text: "Hard work beats talent when talent doesn't work hard.", source: "Tim Notke" },
  { text: "For indeed, with hardship will be ease.", source: "Quran 94:5" },
  { text: "And whoever relies upon Allah — then He is sufficient for him.", source: "Quran 65:3" },
  { text: "Discipline is the bridge between goals and accomplishment.", source: "Jim Rohn" },
];

export default function FeedPage() {
  const [mounted, setMounted] = useState(false);
  const [streaks, setStreaks] = useState({
    training: 0, meditation: 0, music: 0, writing: 0, gratitude: 0, prayers: 0,
  });
  const [prayersDone,   setPrayersDone]   = useState(0);
  const [completedGoals, setCompletedGoals] = useState(0);

  const dayIndex = new Date().getDay();
  const quote    = QUOTES[dayIndex % QUOTES.length];
  const dateStr  = format(new Date(), "EEEE, MMMM d");

  useEffect(() => {
    setMounted(true);
    const s   = getLocalStreaks();
    const rec = getLocalTodayRecord();
    setStreaks(s);
    setPrayersDone(rec?.habit_Prayers ? 5 : 0);
    setCompletedGoals(
      [rec?.habit_Training, rec?.habit_Reading, rec?.habit_Creative,
       rec?.habit_Hydration, rec?.habit_Prayers].filter(Boolean).length,
    );
  }, []);

  if (!mounted) return null;

  return (
    <FeedClient
      quote={quote}
      dateStr={dateStr}
      streaks={streaks}
      prayersDone={prayersDone}
      completedGoals={completedGoals}
      totalGoals={5}
      readingStats={{ completedThisMonth: 0, currentlyReading: 0, totalCompleted: 0, planned: 0 }}
    />
  );
}
