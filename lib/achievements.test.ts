import { describe, it, expect } from "vitest";
import { getAchievements } from "@/lib/achievements";
import type { LeaderboardData } from "@/lib/actions/leaderboard";

function baseData(overrides: Partial<LeaderboardData> = {}): LeaderboardData {
  return {
    totalDays: 0, totalGratitudes: 0, bestDayRating: 0, bestDayRatingDate: "",
    bestMood: 0, bestMoodDate: "",
    currentStreaks: { training: 0, prayers: 0, music: 0, writing: 0, gratitude: 0, meditation: 0 },
    bestStreaks: {
      training: { streak: 0, endDate: "" }, prayers: { streak: 0, endDate: "" },
      music: { streak: 0, endDate: "" }, writing: { streak: 0, endDate: "" },
      gratitude: { streak: 0, endDate: "" }, meditation: { streak: 0, endDate: "" },
    },
    habitTotals: { training: 0, prayers: 0, music: 0, writing: 0, gratitude: 0, meditation: 0 },
    topRatedDays: [], topMoodDays: [],
    ...overrides,
  };
}

describe("getAchievements", () => {
  it("unlocks nothing for a brand-new, empty account", () => {
    const badges = getAchievements(baseData());
    expect(badges.every((b) => !b.unlocked)).toBe(true);
  });

  it("unlocks First Steps once a single day is logged", () => {
    const badges = getAchievements(baseData({ totalDays: 1 }));
    expect(badges.find((b) => b.id === "first-steps")?.unlocked).toBe(true);
  });

  it("unlocks streak badges based on the best streak across all habits, not just one", () => {
    const data = baseData({
      bestStreaks: {
        training: { streak: 0, endDate: "" }, prayers: { streak: 0, endDate: "" },
        music: { streak: 35, endDate: "" }, writing: { streak: 0, endDate: "" },
        gratitude: { streak: 0, endDate: "" }, meditation: { streak: 0, endDate: "" },
      },
    });
    const badges = getAchievements(data);
    expect(badges.find((b) => b.id === "week-streak")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "month-streak")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "century-streak")?.unlocked).toBe(false);
  });

  it("unlocks Prayer Perfectionist independently of other streak badges", () => {
    const data = baseData({
      bestStreaks: {
        training: { streak: 0, endDate: "" }, prayers: { streak: 7, endDate: "" },
        music: { streak: 0, endDate: "" }, writing: { streak: 0, endDate: "" },
        gratitude: { streak: 0, endDate: "" }, meditation: { streak: 0, endDate: "" },
      },
    });
    const badges = getAchievements(data);
    expect(badges.find((b) => b.id === "prayer-perfectionist")?.unlocked).toBe(true);
  });

  it("unlocks Gratitude Practice and Century Logger from their own counters", () => {
    const badges = getAchievements(baseData({ totalGratitudes: 30, totalDays: 100 }));
    expect(badges.find((b) => b.id === "gratitude-practice")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "century-logger")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "year-one")?.unlocked).toBe(false);
  });
});
