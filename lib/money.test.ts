import { describe, expect, it } from "vitest";
import { monthlySeries, monthSummary, mrrKm, toKmCents } from "./money";
import { followUpMessage, OPT_OUT_LINE, scoreLead, uptimeSummary, withDemoLink } from "./outreach";

describe("money", () => {
  it("converts to KM (EUR is pegged)", () => {
    expect(toKmCents(10000, "EUR", 1.8)).toBe(19558);
    expect(toKmCents(10000, "USD", 1.8)).toBe(18000);
    expect(toKmCents(5000, "KM", 1.8)).toBe(5000);
    expect(() => toKmCents(1, "GBP", 1.8)).toThrow();
  });
  it("sums the month against the goal and builds a 6-month series", () => {
    const rows = [
      { source: "client", amountKmCents: 80000, receivedAt: "2026-10-03T10:00:00Z" },
      { source: "beat", amountKmCents: 9000, receivedAt: "2026-10-05T10:00:00Z" },
      { source: "client", amountKmCents: 50000, receivedAt: "2026-09-20T10:00:00Z" },
    ];
    expect(monthSummary(rows, "2026-10", 2000)).toMatchObject({ totalCents: 89000, goalPct: 45, bySource: { client: 80000, beat: 9000 } });
    const series = monthlySeries(rows, "2026-10", 3);
    expect(series.map((s) => s.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(series[2]).toMatchObject({ client: 800, beat: 90 });
    expect(mrrKm([{ retainerKm: 80 }, { retainerKm: null }, { retainerKm: 100 }])).toBe(180);
  });
});

describe("outreach automations", () => {
  it("adds the demo link once, above the opt-out", () => {
    const msg = `Dobar dan!\n\n${OPT_OUT_LINE}`;
    const once = withDemoLink(msg, "https://x/p/abc");
    expect(once.indexOf("https://x/p/abc")).toBeLessThan(once.indexOf(OPT_OUT_LINE));
    expect(withDemoLink(once, "https://x/p/abc")).toBe(once);
  });
  it("writes a gender-neutral follow-up with the opt-out", () => {
    const f = followUpMessage({ name: "Smile", senderName: "Ajdin", demo: "https://x/p/abc" });
    expect(f).toContain("https://x/p/abc");
    expect(f.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(f).not.toMatch(/\b(poslao|poslala|napravio|napravila)\b/);
  });
  it("boosts brand-new and just-broken businesses", () => {
    const base = { gaps: ["no_booking"] };
    expect(scoreLead({ ...base, tags: ["site_broke"] })).toBeGreaterThan(scoreLead({ ...base, tags: ["new_business"] }));
    expect(scoreLead({ ...base, tags: ["new_business"] })).toBeGreaterThan(scoreLead(base));
  });
  it("summarises uptime", () => {
    expect(uptimeSummary([{ ok: true, ms: 200 }, { ok: true, ms: 400 }, { ok: false, ms: null }, { ok: true, ms: 300 }])).toEqual({ checks: 4, uptimePct: 75, avgMs: 300 });
    expect(uptimeSummary([])).toBeNull();
  });
});

import { isDue } from "@/lib/services/scheduler";
describe("scheduler", () => {
  const at = (day: string, h: number) => ({ day, minutes: h * 60 });
  it("runs daily tasks once a day after their hour", () => {
    expect(isDue({ daily: 7 }, at("2026-10-10", 6.9), null, 0)).toBe(false);
    expect(isDue({ daily: 7 }, at("2026-10-10", 7.1), null, 0)).toBe(true);
    expect(isDue({ daily: 7 }, at("2026-10-10", 9), { day: "2026-10-10", at: new Date() }, Date.now())).toBe(false);
    expect(isDue({ daily: 7 }, at("2026-10-11", 9), { day: "2026-10-10", at: new Date() }, Date.now())).toBe(true);
  });
  it("runs interval tasks inside their window", () => {
    const last = { day: "2026-10-10", at: new Date("2026-10-10T08:00:00Z") };
    expect(isDue({ every: 60, from: 6, to: 23 }, at("2026-10-10", 10), last, new Date("2026-10-10T08:30:00Z").getTime())).toBe(false);
    expect(isDue({ every: 60, from: 6, to: 23 }, at("2026-10-10", 10), last, new Date("2026-10-10T09:01:00Z").getTime())).toBe(true);
    expect(isDue({ every: 60, from: 6, to: 23 }, at("2026-10-10", 23.5), null, 0)).toBe(false);
  });
  it("runs monthly tasks on the 1st only", () => {
    expect(isDue({ monthly: 9 }, at("2026-11-01", 10), { day: "2026-10-01", at: new Date() }, Date.now())).toBe(true);
    expect(isDue({ monthly: 9 }, at("2026-11-02", 10), { day: "2026-10-01", at: new Date() }, Date.now())).toBe(false);
  });
});
