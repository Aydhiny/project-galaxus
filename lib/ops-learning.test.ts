import { describe, expect, it } from "vitest";
import {
  EMPTY_COUNTS, addCounts, categoryKey, gapsBucket, leadDecisionDelta, learnedWeight, pairWeight, parsePrefCounts, parsePrefSource,
  preferenceSummary, prefMemory, prefSource, rankBusinessRows, statusBucket, type Preference,
} from "@/lib/ops-learning";

describe("categories and website buckets meet across Outreach and Ops", () => {
  it("normalizes category names", () => {
    expect(categoryKey("Dentists")).toBe("dentist");
    expect(categoryKey("Dentist")).toBe("dentist");
    expect(categoryKey("dentist")).toBe("dentist");
    expect(categoryKey("Hair salons & barbers")).toBe("hairdresser");
    expect(categoryKey("Clinics & doctors")).toBe("clinic");
    expect(categoryKey("Wedding planners")).toBe("wedding_planner");
    expect(categoryKey(null)).toBe("other");
  });

  it("buckets finder statuses and lead gaps the same way", () => {
    expect(statusBucket("No website")).toBe("none");
    expect(statusBucket("Only Facebook/Instagram")).toBe("social");
    expect(statusBucket("Website broken")).toBe("broken");
    expect(statusBucket("No online booking, Looks outdated")).toBe("weak");
    expect(statusBucket("Good")).toBe("good");
    expect(statusBucket("")).toBe("any");
    expect(gapsBucket(["no_website"])).toBe("none");
    expect(gapsBucket(["social_only"], "https://facebook.com/x")).toBe("social");
    expect(gapsBucket(["outdated"], "https://x.ba")).toBe("weak");
    expect(gapsBucket([], "https://x.ba")).toBe("good");
    expect(gapsBucket([], null)).toBe("any");
  });
});

describe("the preference memory", () => {
  it("has a stable source key per pair, so repeats update one memory", () => {
    expect(prefSource("dentist", "good")).toBe("pref:dentist:good");
    expect(parsePrefSource("pref:dentist:good")).toEqual({ category: "dentist", bucket: "good" });
    expect(parsePrefSource("deliverable:4")).toBeNull();
  });

  it("reads like 'Skipped: dentists with a good website (3×)' and round-trips its tally", () => {
    const c = { skip: 3, advance: 0, accept: 0, sendBack: 1 };
    const m = prefMemory("dentist", "good", c, 'last skipped as "not a fit"');
    expect(m.title).toBe("Skipped: dentists with a good website (3×)");
    expect(m.body).toContain("rank them lower");
    expect(parsePrefCounts(m.body)).toEqual(c);
    expect(prefMemory("dentist", "none", { skip: 0, advance: 2, accept: 1, sendBack: 0 }).title).toBe("Moved forward: dentists with no website (2×)");
    expect(prefMemory("research_mission", "any", { skip: 0, advance: 0, accept: 2, sendBack: 0 }).title).toBe("Accepted: research missions (2×)");
    expect(parsePrefCounts("no tally")).toEqual(EMPTY_COUNTS);
  });

  it("adds deltas without going below zero", () => {
    expect(addCounts({ skip: 1, advance: 0, accept: 0, sendBack: 0 }, { skip: -2, advance: 1 })).toEqual({ skip: 0, advance: 1, accept: 0, sendBack: 0 });
  });
});

describe("what a lead update teaches", () => {
  const s = (status: string, skipReason: string | null = null) => ({ status, skipReason });
  it("a skip for not a fit / wrong business", () => {
    expect(leadDecisionDelta(s("ready"), s("skipped", "not_a_fit"))).toEqual({ skip: 1 });
    expect(leadDecisionDelta(s("queued"), s("skipped", "wrong_business"))).toEqual({ skip: 1 });
  });
  it("the pipeline's own skips (no phone, no gaps) teach nothing", () => {
    expect(leadDecisionDelta(s("new"), s("skipped", "no_phone"))).toBeNull();
  });
  it("undo takes the skip back", () => {
    expect(leadDecisionDelta(s("skipped", "not_a_fit"), s("ready", "not_a_fit"))).toEqual({ skip: -1 });
  });
  it("replied / meeting / client is a step forward, once", () => {
    expect(leadDecisionDelta(s("sent"), s("replied"))).toEqual({ advance: 1 });
    expect(leadDecisionDelta(s("replied"), s("meeting"))).toBeNull();
    expect(leadDecisionDelta(s("replied"), s("sent"))).toEqual({ advance: -1 });
    expect(leadDecisionDelta(s("sent"), s("not_interested"))).toBeNull();
  });
});

describe("ranking with what was learned", () => {
  const pref = (category: string, bucket: Preference["bucket"], c: Partial<Preference["counts"]>): Preference => ({ category, bucket, counts: { ...EMPTY_COUNTS, ...c } });

  it("weights are smoothed: one decision is a nudge, many are a lean", () => {
    expect(pairWeight(undefined)).toBe(0);
    expect(pairWeight({ ...EMPTY_COUNTS, skip: 1 })).toBeCloseTo(-1 / 3);
    expect(pairWeight({ ...EMPTY_COUNTS, skip: 10 })).toBeLessThan(-0.8);
    expect(pairWeight({ ...EMPTY_COUNTS, advance: 1 })).toBeCloseTo(0.5); // a reply counts double
  });

  it("the exact pair matters most, the category as a whole a little", () => {
    const prefs = [pref("dentist", "good", { skip: 8 }), pref("dentist", "none", { advance: 3 })];
    expect(learnedWeight(prefs, "Dentists", "Good")).toBeLessThan(-0.5);
    expect(learnedWeight(prefs, "Dentists", "No website")).toBeGreaterThan(0.4); // its own pair wins over the category's skips
    expect(learnedWeight(prefs, "Gyms", "Good")).toBe(0);
  });

  it("without preferences it keeps the finder's order: need first, then a phone", () => {
    const rows = [
      { name: "a", category: "Dentists", websiteStatus: "Good", phone: "1" },
      { name: "b", category: "Dentists", websiteStatus: "No website", phone: "" },
      { name: "c", category: "Dentists", websiteStatus: "No website", phone: "2" },
      { name: "d", category: "Dentists", websiteStatus: "Looks outdated", phone: "" },
    ];
    expect(rankBusinessRows(rows, []).map((r) => r.name)).toEqual(["c", "b", "d", "a"]);
  });

  it("a strong lean moves rows across need tiers", () => {
    const rows = [
      { name: "outdated-gym", category: "Gyms", websiteStatus: "Looks outdated", phone: "1" },
      { name: "nosite-gym", category: "Gyms", websiteStatus: "No website", phone: "1" },
    ];
    // You keep skipping gyms with no website and keep moving forward gyms with a weak one.
    const prefs = [pref("gym", "none", { skip: 9 }), pref("gym", "weak", { advance: 5 })];
    expect(rankBusinessRows(rows, prefs).map((r) => r.name)).toEqual(["outdated-gym", "nosite-gym"]);
    expect(rankBusinessRows(rows, []).map((r) => r.name)).toEqual(["nosite-gym", "outdated-gym"]);
  });

  it("summarizes the strongest preferences for the planner", () => {
    const text = preferenceSummary([pref("dentist", "good", { skip: 3 }), pref("gym", "none", { advance: 1 }), pref("cafe", "any", {})]);
    expect(text.split("\n")).toEqual(["- Skipped: dentists with a good website (3×)", "- Moved forward: gyms with no website (1×)"]);
  });
});
