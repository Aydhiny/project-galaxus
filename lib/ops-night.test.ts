// Night shift rules: when it runs, which engine an agent may use at night, and
// when a project's next day may be planned early — around midnight in
// Sarajevo, around UTC midnight, across the DST change, and west of UTC.

import { describe, expect, it } from "vitest";
import { clockIn, nightPlanDue, nightRoute, nightShiftNow, nightSummary, sleepWindow, wakeDay } from "@/lib/ops-night";

const SJ = "Europe/Sarajevo";
const at = (iso: string, tz = SJ) => clockIn(tz, new Date(iso));
const night = (iso: string, o: { bed?: string | null; wake?: string | null; shiftState?: "on" | "off" | "none"; enabled?: boolean; tz?: string } = {}) =>
  nightShiftNow({ enabled: o.enabled ?? true, hhmm: at(iso, o.tz).hhmm, bed: o.bed, wake: o.wake, shiftState: o.shiftState ?? "off" });
const planDue = (iso: string, tz = SJ, wake?: string) => nightPlanDue({ ...at(iso, tz), wake });

describe("sleepWindow", () => {
  it("uses your Sleep Guardian times, else 23:00–07:00", () => {
    expect(sleepWindow({ bed: "22:30", wake: "06:15" })).toEqual({ bed: "22:30", wake: "06:15" });
    expect(sleepWindow(null)).toEqual({ bed: "23:00", wake: "07:00" });
    expect(sleepWindow({ bed: null, wake: "08:00" })).toEqual({ bed: "23:00", wake: "08:00" });
    expect(sleepWindow({ bed: "25:00", wake: "nope" })).toEqual({ bed: "23:00", wake: "07:00" });
    expect(sleepWindow({ bed: "07:00", wake: "07:00" })).toEqual({ bed: "23:00", wake: "07:00" }); // no window at all makes no sense
  });
});

describe("nightShiftNow (Sarajevo, summer time UTC+2)", () => {
  it("runs from bedtime to wake time, across midnight", () => {
    expect(night("2026-10-15T20:59:00Z")).toBe(false); // 22:59
    expect(night("2026-10-15T21:00:00Z")).toBe(true); // 23:00 bedtime
    expect(night("2026-10-15T21:59:00Z")).toBe(true); // 23:59
    expect(night("2026-10-15T22:00:00Z")).toBe(true); // 00:00 local midnight
    expect(night("2026-10-15T23:59:00Z")).toBe(true); // 01:59
    expect(night("2026-10-16T00:00:00Z")).toBe(true); // 02:00 = UTC midnight
    expect(night("2026-10-16T04:59:00Z")).toBe(true); // 06:59
    expect(night("2026-10-16T05:00:00Z")).toBe(false); // 07:00 wake
  });

  it("is off when you didn't turn it on, and a shift you set always wins", () => {
    expect(night("2026-10-16T00:30:00Z", { enabled: false })).toBe(false);
    expect(night("2026-10-16T00:30:00Z", { shiftState: "on" })).toBe(false); // an overnight shift you set: normal rules
    expect(night("2026-10-16T00:30:00Z", { shiftState: "none" })).toBe(true); // no shift set: still free-only at night
  });

  it("follows your own bedtime, also one after midnight", () => {
    expect(night("2026-10-15T20:45:00Z", { bed: "22:30", wake: "06:00" })).toBe(true); // 22:45
    expect(night("2026-10-15T22:30:00Z", { bed: "01:00", wake: "09:00" })).toBe(false); // 00:30, before a 01:00 bedtime
    expect(night("2026-10-15T23:30:00Z", { bed: "01:00", wake: "09:00" })).toBe(true); // 01:30
    expect(night("2026-10-16T06:30:00Z", { bed: "01:00", wake: "09:00" })).toBe(true); // 08:30
  });

  it("winter time (UTC+1) moves the window with the clock", () => {
    expect(night("2026-11-15T21:30:00Z")).toBe(false); // 22:30 CET
    expect(night("2026-11-15T22:00:00Z")).toBe(true); // 23:00 CET
    expect(night("2026-11-16T05:59:00Z")).toBe(true); // 06:59 CET
    expect(night("2026-11-16T06:00:00Z")).toBe(false); // 07:00 CET
  });

  it("the DST night itself (25 Oct 2026, 03:00 CEST → 02:00 CET)", () => {
    expect(at("2026-10-25T00:30:00Z").hhmm).toBe("02:30"); // CEST
    expect(at("2026-10-25T01:30:00Z").hhmm).toBe("02:30"); // CET: the hour repeats
    expect(night("2026-10-25T05:30:00Z")).toBe(true); // 06:30 CET
    expect(night("2026-10-25T06:00:00Z")).toBe(false); // 07:00 CET
  });
});

describe("nightRoute: never Claude at night", () => {
  it("auto and free agents use free models; Claude-only agents wait for morning", () => {
    expect(nightRoute({ engine: "auto", freeReady: true })).toBe("free");
    expect(nightRoute({ engine: "free", freeReady: true })).toBe("free");
    expect(nightRoute({ engine: "claude", freeReady: true })).toBe("none");
    expect(nightRoute({ engine: "auto", freeReady: false })).toBe("none"); // no free model left: nothing runs (not Claude)
    for (const engine of ["auto", "free", "claude", "weird"]) for (const freeReady of [true, false]) {
      expect(nightRoute({ engine, freeReady })).not.toBe("claude");
    }
  });
});

describe("wakeDay / nightPlanDue: plan the next day early, never twice", () => {
  it("the day you wake up into", () => {
    expect(wakeDay("2026-10-15", "23:30", "07:00")).toBe("2026-10-16");
    expect(wakeDay("2026-10-16", "00:30", "07:00")).toBe("2026-10-16");
    expect(wakeDay("2026-12-31", "23:10", "07:00")).toBe("2027-01-01"); // over the year end
  });

  it("Sarajevo: only once the UTC date is the day you wake up into", () => {
    expect(planDue("2026-10-15T21:30:00Z")).toBe(false); // 23:30 local, UTC still the 15th (the day that's ending)
    expect(planDue("2026-10-15T22:30:00Z")).toBe(false); // 00:30 local on the 16th, UTC still the 15th
    expect(planDue("2026-10-15T23:59:00Z")).toBe(false); // 01:59 local
    expect(planDue("2026-10-16T00:00:00Z")).toBe(true); // 02:00 local = UTC midnight: the 16th may be planned
    expect(planDue("2026-10-16T04:30:00Z")).toBe(true); // 06:30 local
    // Winter: UTC midnight is 01:00 local.
    expect(planDue("2026-11-15T23:30:00Z")).toBe(false); // 00:30 CET
    expect(planDue("2026-11-16T00:05:00Z")).toBe(true); // 01:05 CET
  });

  it("west of UTC (New York): UTC midnight comes before bedtime, so the whole night may plan", () => {
    expect(at("2026-10-16T03:30:00Z", "America/New_York")).toMatchObject({ hhmm: "23:30", localDay: "2026-10-15", utcDay: "2026-10-16" });
    expect(planDue("2026-10-16T03:30:00Z", "America/New_York")).toBe(true); // wakes into the 16th = UTC day
    expect(planDue("2026-10-16T09:30:00Z", "America/New_York")).toBe(true); // 05:30 local
  });

  it("a later wake time counts", () => {
    expect(planDue("2026-10-16T00:30:00Z", SJ, "09:00")).toBe(true); // 02:30, wakes 09:00 on the 16th
  });
});

describe("clockIn / nightSummary", () => {
  it("falls back to UTC on a bad timezone", () => {
    expect(clockIn("Not/AZone", new Date("2026-10-16T00:30:00Z"))).toEqual({ hhmm: "00:30", localDay: "2026-10-16", utcDay: "2026-10-16" });
  });

  it("says what the night did, in one line", () => {
    expect(nightSummary({ done: 3 })).toBe("Night shift: 3 missions done on free models while you slept. $0 of your Claude plan used.");
    expect(nightSummary({ done: 1, stillOpen: 2 })).toContain("1 mission done on free models");
    expect(nightSummary({ done: 1, stillOpen: 2 })).toContain("2 missions still open.");
    expect(nightSummary({ done: 0 })).toBe("Night shift: no missions finished overnight. Nothing was spent.");
  });
});
