import { describe, it, expect } from "vitest";
import { parseQuickAdd, bucketFor, groupByBucket } from "./tasks";

// Thursday 2026-10-08, local time
const NOW = new Date(2026, 9, 8, 12, 0, 0);

describe("parseQuickAdd", () => {
  it("extracts due date and priority tokens", () => {
    expect(parseQuickAdd("Call mom tomorrow !high", NOW)).toEqual({
      title: "Call mom",
      dueDate: "2026-10-09",
      priority: "high",
    });
  });

  it("understands weekdays as the next occurrence", () => {
    expect(parseQuickAdd("Ship beat fri", NOW).dueDate).toBe("2026-10-09");
    expect(parseQuickAdd("Review mon", NOW).dueDate).toBe("2026-10-12");
  });

  it("leaves plain titles untouched", () => {
    expect(parseQuickAdd("Finish chapter 3", NOW)).toEqual({ title: "Finish chapter 3", dueDate: null, priority: "none" });
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

  it("sorts high priority first within a bucket", () => {
    const groups = groupByBucket([t(1, today, "todo", "low"), t(2, today, "todo", "high")], today);
    expect(groups.today.map((x) => x.id)).toEqual([2, 1]);
  });
});
