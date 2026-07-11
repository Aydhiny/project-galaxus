import type { LeaderboardData } from "@/lib/leaderboard-utils";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide-react icon name — mapped to a component in the UI layer
  unlocked: boolean;
}

function maxBestStreak(data: LeaderboardData): number {
  return Math.max(
    data.bestStreaks.training.streak,
    data.bestStreaks.prayers.streak,
    data.bestStreaks.music.streak,
    data.bestStreaks.writing.streak,
    data.bestStreaks.gratitude.streak,
    data.bestStreaks.meditation.streak
  );
}

/** Pure — derives badges from already-computed stats. Nothing is stored; nothing can drift out of sync. */
export function getAchievements(data: LeaderboardData): Achievement[] {
  const best = maxBestStreak(data);

  return [
    {
      id: "first-steps",
      label: "First Steps",
      description: "Log your first day",
      icon: "Footprints",
      unlocked: data.totalDays >= 1,
    },
    {
      id: "week-streak",
      label: "One Week Strong",
      description: "Any 7-day habit streak",
      icon: "Flame",
      unlocked: best >= 7,
    },
    {
      id: "month-streak",
      label: "30-Day Habit",
      description: "Any 30-day habit streak",
      icon: "CalendarCheck",
      unlocked: best >= 30,
    },
    {
      id: "century-streak",
      label: "100-Day Habit",
      description: "Any 100-day habit streak",
      icon: "Trophy",
      unlocked: best >= 100,
    },
    {
      id: "prayer-perfectionist",
      label: "Prayer Perfectionist",
      description: "7 straight days of all 5 prayers",
      icon: "Moon",
      unlocked: data.bestStreaks.prayers.streak >= 7,
    },
    {
      id: "gratitude-practice",
      label: "Gratitude Practice",
      description: "Logged gratitude 30 times",
      icon: "Heart",
      unlocked: data.totalGratitudes >= 30,
    },
    {
      id: "century-logger",
      label: "Century Logger",
      description: "100 days logged in total",
      icon: "BarChart2",
      unlocked: data.totalDays >= 100,
    },
    {
      id: "year-one",
      label: "A Year of Growth",
      description: "365 days logged in total",
      icon: "Star",
      unlocked: data.totalDays >= 365,
    },
  ];
}
