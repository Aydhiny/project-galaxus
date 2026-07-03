import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeCurrentStreak, computeBestStreak, prayerStreak, bestPrayerStreak } from "@/lib/streaks";
import type { DailyCheckin } from "@/lib/db/schema";

function row(date: string, overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 0, userId: 0, date, fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false,
    quranPages: 0, training: false, trainingMinutes: 0, meditation: false, meditationMinutes: 0,
    music: false, musicMinutes: 0, design: false, youtube: false, writing: false, gratitude: false,
    gratitudeText: null, notes: null, sleepHours: null, sleepQuality: null, bedTime: null, wakeTime: null,
    morningMood: null, eveningMood: null, dayRating: null, intention: null, priorities: null,
    tomorrowNote: null, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

// Fixed "today" so streak-from-today logic is deterministic regardless of when tests run.
const TODAY = "2026-07-03";
function daysAgo(n: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

describe("computeCurrentStreak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  });
  afterEach(() => vi.useRealTimers());

  it("counts consecutive true days ending today", () => {
    const desc = [
      row(daysAgo(0), { training: true }),
      row(daysAgo(1), { training: true }),
      row(daysAgo(2), { training: true }),
      row(daysAgo(3), { training: false }),
    ];
    expect(computeCurrentStreak(desc, "training")).toBe(3);
  });

  it("still counts if the most recent entry is yesterday, not today", () => {
    const desc = [row(daysAgo(1), { training: true }), row(daysAgo(2), { training: true })];
    expect(computeCurrentStreak(desc, "training")).toBe(2);
  });

  it("returns 0 immediately when the most recent day is false", () => {
    const desc = [row(daysAgo(0), { training: false }), row(daysAgo(1), { training: true })];
    expect(computeCurrentStreak(desc, "training")).toBe(0);
  });

  it("breaks the streak on a gap of more than a day since the last entry", () => {
    const desc = [row(daysAgo(3), { training: true }), row(daysAgo(4), { training: true })];
    expect(computeCurrentStreak(desc, "training")).toBe(0);
  });
});

describe("computeBestStreak", () => {
  it("finds the longest run of consecutive true days", () => {
    const asc = [
      row("2026-01-01", { training: true }),
      row("2026-01-02", { training: true }),
      row("2026-01-03", { training: false }),
      row("2026-01-04", { training: true }),
      row("2026-01-05", { training: true }),
      row("2026-01-06", { training: true }),
    ];
    const result = computeBestStreak(asc, "training");
    expect(result.streak).toBe(3);
    expect(result.endDate).toBe("2026-01-06");
  });

  it("resets on a non-consecutive date even if both days are true", () => {
    const asc = [
      row("2026-01-01", { training: true }),
      row("2026-01-05", { training: true }), // gap — not consecutive
    ];
    expect(computeBestStreak(asc, "training").streak).toBe(1);
  });

  it("returns 0 for an empty history", () => {
    expect(computeBestStreak([], "training")).toEqual({ streak: 0, endDate: "" });
  });
});

describe("prayerStreak", () => {
  it("requires all five prayers to count a day", () => {
    const desc = [
      row("2026-01-03", { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }),
      row("2026-01-02", { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: false }), // missed isha
    ];
    expect(prayerStreak(desc)).toBe(1);
  });

  it("returns 0 when the most recent day is incomplete", () => {
    const desc = [row("2026-01-03", { fajr: true })];
    expect(prayerStreak(desc)).toBe(0);
  });
});

describe("bestPrayerStreak", () => {
  it("finds the longest run of all-five-prayer days", () => {
    const allFive = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
    const asc = [
      row("2026-01-01", allFive),
      row("2026-01-02", allFive),
      row("2026-01-03", allFive),
      row("2026-01-04", { fajr: false }),
      row("2026-01-05", allFive),
    ];
    const result = bestPrayerStreak(asc);
    expect(result.streak).toBe(3);
    expect(result.endDate).toBe("2026-01-03");
  });
});
