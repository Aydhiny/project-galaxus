import { describe, it, expect } from "vitest";
import { getPlanLimits, clampHistoryDays } from "@/lib/plan";

describe("getPlanLimits", () => {
  it("caps free plan history at 30 days", () => {
    expect(getPlanLimits("free").historyDays).toBe(30);
  });

  it("gives pro plan unlimited history", () => {
    expect(getPlanLimits("pro").historyDays).toBeNull();
  });

  it("falls back to free limits for an unrecognized plan value", () => {
    expect(getPlanLimits("enterprise").historyDays).toBe(30);
  });
});

describe("clampHistoryDays", () => {
  it("clamps a free-plan request above the limit down to 30", () => {
    expect(clampHistoryDays("free", 365)).toBe(30);
  });

  it("leaves a free-plan request under the limit untouched", () => {
    expect(clampHistoryDays("free", 7)).toBe(7);
  });

  it("never clamps a pro-plan request", () => {
    expect(clampHistoryDays("pro", 365)).toBe(365);
  });
});
