import { describe, it, expect } from "vitest";
import { dayInMonth, daysInMonth, expectedPct, goalPace, goalProgress, groupByPhase, isValidMonth, monthBounds, monthLabel, shiftMonth } from "./goals";

describe("month helpers", () => {
  it("validates, labels and bounds months", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(daysInMonth("2028-02")).toBe(29);
  });
  it("clamps days and shifts months across years", () => {
    expect(dayInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dayInMonth("2026-10", 0)).toBe("2026-10-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("progress & pace", () => {
  const t = (status: string) => ({ status });
  it("computes progress", () => {
    expect(goalProgress([t("done"), t("todo"), t("done"), t("todo")])).toEqual({ done: 2, total: 4, pct: 50 });
    expect(goalProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
  it("measures pace against the calendar", () => {
    expect(expectedPct("2026-10", "2026-10-15")).toBe(48);
    expect(expectedPct("2026-10", "2026-09-30")).toBe(0);
    expect(goalPace("2026-10", "2026-10-15", { done: 5, total: 10, pct: 50 })).toBe("on-track");
    expect(goalPace("2026-10", "2026-10-15", { done: 1, total: 10, pct: 10 })).toBe("behind");
    expect(goalPace("2026-10", "2026-10-05", { done: 4, total: 10, pct: 40 })).toBe("ahead");
    expect(goalPace("2026-10", "2026-10-05", { done: 0, total: 0, pct: 0 })).toBe("no-plan");
    expect(goalPace("2026-11", "2026-10-20", { done: 0, total: 6, pct: 0 })).toBe("not-started");
  });
});

describe("groupByPhase", () => {
  it("orders phases by their earliest task and puts unphased last", () => {
    const tasks = [
      { status: "todo", phase: "Week 2 · Wall holds", dueDate: "2026-10-09" },
      { status: "todo", phase: null, dueDate: "2026-10-01" },
      { status: "todo", phase: "Week 1 · Foundations", dueDate: "2026-10-03" },
      { status: "todo", phase: "Week 1 · Foundations", dueDate: "2026-10-01" },
    ];
    const groups = groupByPhase(tasks);
    expect(groups.map((g) => g.phase)).toEqual(["Week 1 · Foundations", "Week 2 · Wall holds", null]);
    expect(groups[0].tasks.map((x) => x.dueDate)).toEqual(["2026-10-01", "2026-10-03"]);
  });
});

describe("schedulePlan", async () => {
  const { schedulePlan } = await import("@/lib/services/goals");
  it("spreads undated tasks evenly across the month and honours day/date", () => {
    const out = schedulePlan("2026-10", [
      { name: "Week 1", tasks: [{ title: "a" }, { title: "b" }] },
      { name: "Week 4", tasks: [{ title: "c" }, { title: "test", day: 40 }, { title: "x", date: "2026-11-02" }] },
    ]);
    expect(out.map((o) => o.dueDate)).toEqual(["2026-10-01", "2026-10-09", "2026-10-16", "2026-10-31", "2026-11-02"]);
    expect(out[2].phase).toBe("Week 4");
  });
});
