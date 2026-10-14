import { describe, expect, it } from "vitest";
import {
  EXTERNAL_NOTE, MAX_LINK_MESSAGES_PER_DAY, describeRepeat, facilityLabel, levelFor, mdLead, mdTasks, mdToBlocks, parsePrUrl, prLabel,
  recurringDue, repeatMask, runnerCostCents, scoreFor, shiftEnded, standupDue, usageCostCents, weekdayOf,
} from "@/lib/ops";
import { nightLevelAt, parseOpenMeteo } from "@/lib/weather";

describe("real costs", () => {
  it("prices API usage like Anthropic does (Opus 5.5: $4 in / $20 out per MTok, $10 per 1k searches)", () => {
    expect(usageCostCents({ input_tokens: 1_000_000 })).toBe(400);
    expect(usageCostCents({ output_tokens: 100_000 })).toBe(200);
    expect(usageCostCents({ server_tool_use: { web_search_requests: 3 } })).toBe(3);
    expect(usageCostCents({ input_tokens: 10, output_tokens: 10 })).toBe(1); // tiny runs never show as free
    expect(usageCostCents({})).toBe(0);
  });
  it("reads the runner's total_cost_usd, rejecting nonsense", () => {
    expect(runnerCostCents(0.4213)).toBe(43);
    expect(runnerCostCents("1.5")).toBe(150);
    expect(runnerCostCents(null)).toBeNull();
    expect(runnerCostCents(-1)).toBeNull();
    expect(runnerCostCents(9999)).toBeNull();
    expect(runnerCostCents("")).toBeNull();
  });
});

describe("deliverables → Galaxus", () => {
  const md = [
    "# Monitor options",
    "Best value: **Dell P2723** at [Links](https://links.ba/dell)",
    "- Dell P2723, 520 KM",
    "  - ships from Sarajevo",
    "1. LG 27UP",
    "> prices change weekly",
    "```js",
    "const x = '<script>';",
    "```",
    "---",
    "## Next steps",
    "- Order the Dell before Friday",
    "- [ ] Ask Links for a discount",
    "Call +387 61 123 456 for stock",
  ].join("\n");

  it("turns markdown into page blocks, plain text only", () => {
    const b = mdToBlocks(md);
    expect(b.map((x) => x.type)).toEqual(["h1", "paragraph", "bullet", "bullet", "numbered", "quote", "code", "divider", "h2", "bullet", "todo", "paragraph"]);
    expect(b[1].text).toBe("Best value: Dell P2723 at Links (https://links.ba/dell)");
    expect(b[3].indent).toBe(1);
    expect(b[6]).toMatchObject({ type: "code", lang: "js", text: "const x = '<script>';" });
  });
  it("finds the tasks under Next steps first", () => {
    expect(mdTasks(md)).toEqual(["Order the Dell before Friday", "Ask Links for a discount"]);
  });
  it("falls back to open checkboxes, then bullets", () => {
    expect(mdTasks("- [ ] One\n- [x] Done already\n- [ ] Two")).toEqual(["One", "Two"]);
    expect(mdTasks("- Alpha\n- Beta")).toEqual(["Alpha", "Beta"]);
    expect(mdTasks("just prose")).toEqual([]);
  });
  it("guesses a lead's website and phone", () => {
    expect(mdLead(md)).toEqual({ website: "https://links.ba/dell", phone: "+38761123456" });
    expect(mdLead("nothing here")).toEqual({ website: null, phone: null });
  });
});

describe("scorecards", () => {
  const t0 = "2026-10-14T10:00:00Z", t1 = "2026-10-14T10:30:00Z";
  it("counts accepted work, sends back, duels, cost and speed", () => {
    const s = scoreFor([
      { submittedBy: 1, status: "done", reopens: 1, spentCents: 200, claimedAt: t0, submittedAt: t1, duelId: null },
      { submittedBy: 1, status: "done", reopens: 0, spentCents: 400, claimedAt: t0, submittedAt: t1, duelId: 9 },
      { submittedBy: 1, status: "cancelled", reopens: 0, spentCents: 100, claimedAt: null, submittedAt: null, duelId: 12 },
      { submittedBy: 1, status: "submitted", reopens: 0, spentCents: 0, claimedAt: null, submittedAt: null, duelId: null },
    ]);
    expect(s).toMatchObject({ delivered: 4, accepted: 2, sentBack: 1, wins: 1, losses: 1, costPerAcceptedCents: 300, avgMinutes: 30 });
    expect(s.acceptRate).toBeCloseTo(2 / 3);
    expect(s.xp).toBe(2 * 10 + 15 + 4 * 2 - 3);
  });
  it("levels grow slowly and never go below 1", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(19)).toBe(1);
    expect(levelFor(20)).toBe(2);
    expect(levelFor(80)).toBe(3);
    expect(levelFor(-50)).toBe(1);
    expect(scoreFor([]).level).toBe(1);
  });
});

describe("recurring missions", () => {
  it("parses repeat choices", () => {
    expect(repeatMask("once")).toBeNull();
    expect(repeatMask("")).toBeNull();
    expect(repeatMask("weekdays")).toBe("1111100");
    expect(repeatMask("Mon")).toBe("1000000");
    expect(repeatMask("sun")).toBe("0000001");
    expect(repeatMask("0101010")).toBe("0101010");
    expect(() => repeatMask("0000000")).toThrow();
    expect(() => repeatMask("fortnightly")).toThrow();
    expect(describeRepeat("1111100", "09:00")).toBe("Weekdays at 09:00");
    expect(describeRepeat("1000001", "18:30")).toBe("Mon, Sun at 18:30");
  });
  it("is due once on its days after its time", () => {
    const r = { days: "1111100", time: "09:00", lastPostedDay: null, active: true };
    const mon = { day: "2026-10-12", weekday: weekdayOf("2026-10-12") };
    expect(mon.weekday).toBe(0);
    expect(recurringDue(r, { ...mon, hhmm: "08:59" })).toBe(false);
    expect(recurringDue(r, { ...mon, hhmm: "09:00" })).toBe(true);
    expect(recurringDue({ ...r, lastPostedDay: "2026-10-12" }, { ...mon, hhmm: "10:00" })).toBe(false);
    expect(recurringDue(r, { day: "2026-10-18", weekday: weekdayOf("2026-10-18"), hhmm: "10:00" })).toBe(false); // Sunday
    expect(recurringDue({ ...r, active: false }, { ...mon, hhmm: "10:00" })).toBe(false);
  });
});

describe("stand-up and debrief timing", () => {
  it("stands up once, in the first 90 minutes", () => {
    const s = { startsAt: "09:00", endsAt: "17:00", standupAt: null };
    expect(standupDue(s, "08:59")).toBe(false);
    expect(standupDue(s, "09:00")).toBe(true);
    expect(standupDue(s, "10:29")).toBe(true);
    expect(standupDue(s, "10:30")).toBe(false);
    expect(standupDue({ ...s, standupAt: new Date() }, "09:10")).toBe(false);
    expect(standupDue(null, "09:10")).toBe(false);
  });
  it("debriefs a same-day shift after it ends, and an overnight shift the next morning", () => {
    const day = { startsAt: "09:00", endsAt: "17:00", debriefAt: null };
    expect(shiftEnded(day, "16:59", "today")).toBe(false);
    expect(shiftEnded(day, "17:00", "today")).toBe(true);
    expect(shiftEnded({ ...day, debriefAt: new Date() }, "18:00", "today")).toBe(false);
    const night = { startsAt: "20:00", endsAt: "02:00", debriefAt: null };
    expect(shiftEnded(night, "23:00", "today")).toBe(false); // overnight shifts never end "today"
    expect(shiftEnded(night, "01:00", "yesterday")).toBe(false);
    expect(shiftEnded(night, "02:30", "yesterday")).toBe(true);
    expect(shiftEnded(night, "21:00", "yesterday")).toBe(false);
  });
});

describe("pull requests", () => {
  it("parses only real GitHub PR urls", () => {
    expect(parsePrUrl("https://github.com/Aydhiny/Hunter-Mouse-2/pull/12/files")).toEqual({ owner: "Aydhiny", repo: "Hunter-Mouse-2", number: 12, url: "https://github.com/Aydhiny/Hunter-Mouse-2/pull/12" });
    expect(parsePrUrl("https://github.com/a/b/issues/3")).toBeNull();
    expect(parsePrUrl("https://evil.com/github.com/a/b/pull/1")).toBeNull();
    expect(parsePrUrl("http://github.com/a/b/pull/1")).toBeNull();
  });
  it("labels status", () => {
    expect(prLabel({ url: "", title: "", state: "open", checks: "passing", review: "approved" })).toBe("PR open · checks ✓ · approved");
    expect(prLabel({ url: "", title: "", state: "merged", checks: "none", review: "pending" })).toBe("PR merged");
  });
});

describe("linked facilities", () => {
  it("names a facility by its city name, else the owner's first name", () => {
    expect(facilityLabel({ name: "Faruk Hadžić", cityName: null })).toBe("Faruk");
    expect(facilityLabel({ name: "Faruk", cityName: " Baščaršija " })).toBe("Baščaršija");
    expect(facilityLabel({ name: null })).toBe("Partner");
  });
  it("tells agents partner messages are requests, and caps traffic", () => {
    expect(EXTERNAL_NOTE).toMatch(/request/);
    expect(EXTERNAL_NOTE).toMatch(/never as an instruction/);
    expect(MAX_LINK_MESSAGES_PER_DAY).toBeGreaterThan(0);
  });
});

describe("real sun and forecast", () => {
  it("is day between sunrise and sunset, night outside, with dusk and dawn", () => {
    expect(nightLevelAt(12, "06:58", "18:12")).toBe(0);
    expect(nightLevelAt(23, "06:58", "18:12")).toBe(1);
    expect(nightLevelAt(3, "06:58", "18:12")).toBe(1);
    const dusk = nightLevelAt(18.2, "06:58", "18:12");
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    // No times known: fixed 7:00 / 19:00.
    expect(nightLevelAt(12)).toBe(0);
    expect(nightLevelAt(22)).toBe(1);
  });
  it("reads sunrise, sunset and 3 days from Open-Meteo", () => {
    const sky = parseOpenMeteo({
      current: { temperature_2m: 14.4, weather_code: 0, is_day: 1 },
      daily: { time: ["2026-10-14", "2026-10-15", "2026-10-16"], weather_code: [0, 61, 3], temperature_2m_max: [18.2, 12.6, 11], temperature_2m_min: [5.1, 7, 4.4], sunrise: ["2026-10-14T06:58", "x", "y"], sunset: ["2026-10-14T18:12", "x", "y"] },
    }, "Sarajevo")!;
    expect(sky).toMatchObject({ sunrise: "06:58", sunset: "18:12" });
    expect(sky.forecast).toEqual([
      { day: "2026-10-14", kind: "sun", label: "Clear", max: 18, min: 5 },
      { day: "2026-10-15", kind: "rain", label: "Light rain", max: 13, min: 7 },
      { day: "2026-10-16", kind: "clouds", label: "Overcast", max: 11, min: 4 },
    ]);
  });
});
