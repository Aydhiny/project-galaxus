import { describe, it, expect } from "vitest";
import { parseQuickAdd, bucketFor, groupByBucket, moveInList, moveTo, taskPoints, repeatsOn, describeDays, isValidDaysMask, isValidTime, formatTime, isOverdue, isPastRoutine, liveStreak, routineStreak } from "./tasks";

// Thursday 2026-10-08, local time
const NOW = new Date(2026, 9, 8, 12, 0, 0);

describe("parseQuickAdd", () => {
  it("extracts due date and priority tokens", () => {
    expect(parseQuickAdd("Call mom tomorrow !high", NOW)).toEqual({
      title: "Call mom",
      dueDate: "2026-10-09",
      priority: "high",
      area: null,
    });
    expect(parseQuickAdd("100 push-ups #gym", NOW)).toMatchObject({ title: "100 push-ups", area: "training" });
    expect(parseQuickAdd("Read tafsir #deen", NOW).area).toBe("faith");
  });

  it("understands weekdays as the next occurrence", () => {
    expect(parseQuickAdd("Ship beat fri", NOW).dueDate).toBe("2026-10-09");
    expect(parseQuickAdd("Review mon", NOW).dueDate).toBe("2026-10-12");
  });

  it("leaves plain titles untouched", () => {
    expect(parseQuickAdd("Finish chapter 3", NOW)).toEqual({ title: "Finish chapter 3", dueDate: null, priority: "none", area: null });
    expect(parseQuickAdd("Fix bug #42", NOW).title).toBe("Fix bug #42"); // unknown tags stay in the title
  });
});

describe("bucketFor / groupByBucket", () => {
  const today = "2026-10-08";
  const t = (id: number, dueDate: string | null, status = "todo", priority = "none") =>
    ({ id, dueDate, status, priority, orderIndex: id });

  it("buckets by due date relative to today", () => {
    expect(bucketFor(t(1, "2026-10-01"), today)).toBe("overdue");
    expect(bucketFor(t(2, today), today)).toBe("today");
    expect(bucketFor(t(3, "2026-10-12"), today)).toBe("upcoming");
    expect(bucketFor(t(4, "2026-11-30"), today)).toBe("later");
    expect(bucketFor(t(5, null), today)).toBe("later");
    expect(bucketFor(t(6, "2026-10-01", "done"), today)).toBe("done");
  });

  it("keeps the manual order within a bucket (priority no longer reshuffles)", () => {
    const a = { ...t(1, today, "todo", "low"), orderIndex: 1 };
    const b = { ...t(2, today, "todo", "high"), orderIndex: 2 };
    expect(groupByBucket([b, a], today).today.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("reordering", () => {
  it("moves up/down and stops at the edges", () => {
    expect(moveInList([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveInList([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
  it("drops above or below a target", () => {
    expect(moveTo([1, 2, 3, 4], 4, 2, "above")).toEqual([1, 4, 2, 3]);
    expect(moveTo([1, 2, 3, 4], 1, 3, "below")).toEqual([2, 3, 1, 4]);
  });
});

describe("points", () => {
  it("scales by priority and doubles for brought-back tasks", () => {
    expect(taskPoints({ priority: "none" })).toBe(1);
    expect(taskPoints({ priority: "high" })).toBe(5);
    expect(taskPoints({ priority: "medium", restoredAt: new Date() })).toBe(6);
  });
});

describe("recurrence", () => {
  it("matches days by Monday-first mask", () => {
    expect(repeatsOn("1111100", "2026-10-09")).toBe(true); // Friday
    expect(repeatsOn("1111100", "2026-10-10")).toBe(false); // Saturday
    expect(repeatsOn("0000011", "2026-10-11")).toBe(true); // Sunday
  });
  it("describes and validates masks/times", () => {
    expect(describeDays("1111111")).toBe("Every day");
    expect(describeDays("1010100")).toBe("Mon, Wed, Fri");
    expect(isValidDaysMask("0000000")).toBe(false);
    expect(isValidTime("08:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
  });
});

describe("formatTime", () => {
  it("is deterministic 24h (no locale → no hydration mismatch)", () => {
    expect(formatTime("18:00")).toBe("18:00");
    expect(formatTime("7:05")).toBe("07:05");
  });
});

describe("routines are never overdue", () => {
  const today = "2026-10-10";
  const base = { priority: "none", orderIndex: 0 };
  it("hides a missed routine copy instead of calling it overdue", () => {
    const list = [
      { ...base, id: 1, status: "todo", dueDate: "2026-10-09", recurringId: 7 }, // missed routine
      { ...base, id: 2, status: "todo", dueDate: "2026-10-09", recurringId: null }, // real overdue
      { ...base, id: 3, status: "todo", dueDate: today, recurringId: 7 }, // today's copy
    ];
    const g = groupByBucket(list, today);
    expect(g.overdue.map((t) => t.id)).toEqual([2]);
    expect(g.today.map((t) => t.id)).toEqual([3]);
    expect(isOverdue(list[0], today)).toBe(false);
    expect(isPastRoutine(list[0], today)).toBe(true);
  });
});

describe("routine streaks", () => {
  // Weekdays only (Mon–Fri). 2026-10-10 is a Saturday.
  const weekdays = "1111100";
  it("counts consecutive scheduled days, skipping days off", () => {
    const done = new Set(["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-05"]); // missed Tue 10-06
    const s = routineStreak(weekdays, done, "2026-10-10", "2026-09-01");
    expect(s.streakBefore).toBe(3);
    expect(s.best).toBe(3);
  });
  it("doesn't count today as a miss before it's over, and adds it live when done", () => {
    const s = routineStreak("1111111", new Set(["2026-10-09"]), "2026-10-10", "2026-10-01");
    expect(s.streakBefore).toBe(1);
    expect(liveStreak(s, false)).toBe(1);
    expect(liveStreak(s, true)).toBe(2);
  });
  it("stops at the day the routine was created", () => {
    const s = routineStreak("1111111", new Set(["2026-10-08", "2026-10-09"]), "2026-10-10", "2026-10-08");
    expect(s).toMatchObject({ streakBefore: 2, best: 2, rate30: null }); // too new for a rate
    const t = routineStreak("1111111", new Set(["2026-10-07", "2026-10-09"]), "2026-10-10", "2026-10-07");
    expect(t).toMatchObject({ streakBefore: 1, best: 1, rate30: 67 });
  });
});
