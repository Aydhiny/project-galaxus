import { describe, it, expect } from "vitest";
import { completionsByDay, completionStreak, weekOverWeek, heatmapWeeks, bestDay } from "./productivity";

// Friday 2026-10-09, 15:00 local
const NOW = new Date(2026, 9, 9, 15, 0, 0);
const done = (y: number, m: number, d: number, h = 12) => ({ status: "done", completedAt: new Date(y, m, d, h) });

describe("completionsByDay", () => {
  it("buckets completions by local day, oldest first, zero-filled", () => {
    const tasks = [done(2026, 9, 9), done(2026, 9, 9, 23), done(2026, 9, 7), { status: "todo", completedAt: null }];
    const series = completionsByDay(tasks, 3, NOW);
    expect(series.map((d) => [d.date, d.count])).toEqual([
      ["2026-10-07", 1],
      ["2026-10-08", 0],
      ["2026-10-09", 2],
    ]);
    expect(bestDay(series)?.date).toBe("2026-10-09");
  });

  it("ignores tasks that were un-completed", () => {
    expect(completionsByDay([{ status: "todo", completedAt: new Date(NOW) }], 1, NOW)[0].count).toBe(0);
  });
});

describe("completionStreak", () => {
  it("counts back from today when today has completions", () => {
    expect(completionStreak([done(2026, 9, 9), done(2026, 9, 8), done(2026, 9, 7), done(2026, 9, 5)], NOW)).toBe(3);
  });
  it("keeps yesterday's streak alive before you've finished anything today", () => {
    expect(completionStreak([done(2026, 9, 8), done(2026, 9, 7)], NOW)).toBe(2);
  });
  it("is zero when the chain broke", () => {
    expect(completionStreak([done(2026, 9, 6)], NOW)).toBe(0);
  });
});

describe("weekOverWeek", () => {
  it("splits the last 14 days into this week and last week", () => {
    expect(weekOverWeek([done(2026, 9, 9), done(2026, 9, 3), done(2026, 9, 2), done(2026, 8, 20)], NOW)).toEqual({ thisWeek: 2, lastWeek: 1 });
  });
});

describe("heatmapWeeks", () => {
  it("builds Monday-first weeks and marks future days with -1", () => {
    const grid = heatmapWeeks([done(2026, 9, 9)], 2, NOW);
    expect(grid).toHaveLength(2);
    expect(grid[1][0].date).toBe("2026-10-05"); // Monday of this week
    expect(grid[1][4]).toMatchObject({ date: "2026-10-09", count: 1 }); // Friday = today
    expect(grid[1][5].count).toBe(-1); // Saturday is in the future
  });
});
