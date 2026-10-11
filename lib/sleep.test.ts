import { describe, expect, it } from "vitest";
import { averageSleep, inSleepWindow, inWindDown, isGoodNight, nightKey } from "./sleep";

const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m);

describe("sleep guardian timing", () => {
  it("handles a window across midnight", () => {
    expect(inSleepWindow(at(23, 30), "23:00", "07:00")).toBe(true);
    expect(inSleepWindow(at(3), "23:00", "07:00")).toBe(true);
    expect(inSleepWindow(at(7), "23:00", "07:00")).toBe(false);
    expect(inSleepWindow(at(22, 59), "23:00", "07:00")).toBe(false);
  });
  it("handles a same-day window", () => {
    expect(inSleepWindow(at(1, 30), "01:00", "09:00")).toBe(true);
    expect(inSleepWindow(at(0, 30), "01:00", "09:00")).toBe(false);
  });
  it("warns 15 minutes before", () => {
    expect(inWindDown(at(22, 50), "23:00")).toBe(true);
    expect(inWindDown(at(22, 40), "23:00")).toBe(false);
    expect(inWindDown(at(23, 50), "00:00")).toBe(true);
  });
  it("counts a night from evening to morning", () => {
    const evening = new Date(2026, 9, 11, 23, 30);
    const earlyMorning = new Date(2026, 9, 12, 5, 0);
    const noon = new Date(2026, 9, 12, 12, 0);
    expect(nightKey(evening, "07:00")).toBe("2026-10-11");
    expect(nightKey(earlyMorning, "07:00")).toBe("2026-10-11");
    expect(nightKey(noon, "07:00")).toBe("2026-10-12");
  });
});

describe("sleep from check-ins", () => {
  it("averages bedtimes across midnight", () => {
    const rows = ["23:30", "00:30", "00:00"].map((b, i) => ({ date: `2026-10-0${i + 1}`, bedTime: b, wakeTime: "08:00", sleepHours: null }));
    expect(averageSleep(rows)).toEqual({ bedTime: "00:00", wakeTime: "08:00", nights: 3 });
    expect(averageSleep(rows.slice(0, 2))).toBeNull();
  });
  it("counts good nights by hours or bedtime", () => {
    expect(isGoodNight({ date: "x", bedTime: "02:00", wakeTime: null, sleepHours: 7.5 }, "23:00")).toBe(true);
    expect(isGoodNight({ date: "x", bedTime: "23:10", wakeTime: null, sleepHours: 6 }, "23:00")).toBe(true);
    expect(isGoodNight({ date: "x", bedTime: "00:30", wakeTime: null, sleepHours: 6 }, "23:00")).toBe(false);
  });
});
