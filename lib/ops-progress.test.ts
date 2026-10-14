import { describe, expect, it } from "vitest";
import { colIndex, goalProgress, parseGoalTarget, progressForPrompt, progressLine, sheetCounts } from "@/lib/ops-progress";

describe("parseGoalTarget", () => {
  it.each([
    ["Find at least 200 leads in Sarajevo", 200, "leads"],
    ["50 businesses that need a website", 50, "businesses"],
    ["A list of 120 dentists and clinics in Mostar", 120, "dentists"],
    ["Collect 75 hair salons with WhatsApp", 75, "salons"],
    ["1,000 leads across BiH", 1000, "leads"],
    ["1.500 contacts for cold outreach", 1500, "contacts"],
    ["In 14 days, find 30 restaurants without a website", 30, "restaurants"],
    ["Get 40+ local businesses with a broken site", 40, "businesses"],
  ])("%s → %i %s", (goal, count, unit) => {
    expect(parseGoalTarget(goal)).toEqual({ count, unit });
  });

  it("takes a bare number after a collecting verb", () => {
    expect(parseGoalTarget("find at least 200, phones first")).toEqual({ count: 200, unit: null });
    expect(parseGoalTarget("Find me 60 in Tuzla")).toEqual({ count: 60, unit: null });
  });

  it("ignores money, time and rates", () => {
    expect(parseGoalTarget("A plan to earn 500 KM a month from video editing")).toBeNull();
    expect(parseGoalTarget("Finish in 14 days with a $20 budget")).toBeNull();
    expect(parseGoalTarget("Find out how to charge 300 EUR per site")).toBeNull();
    expect(parseGoalTarget("Send 5 leads per day")).toBeNull();
    expect(parseGoalTarget("about 10 per week businesses")).toBeNull();
    expect(parseGoalTarget("")).toBeNull();
    expect(parseGoalTarget(null)).toBeNull();
  });

  it("skips money but still finds the count later in the goal", () => {
    expect(parseGoalTarget("Earn 500 KM: find 80 leads for websites")).toEqual({ count: 80, unit: "leads" });
  });
});

const SHEET = [
  ["Name", "Category", "Address", "Phone", "WhatsApp", "Email", "Website", "Website status", "Source"],
  ["Smile", "Dentists", "Ferhadija 1", "+38761111222", "yes", "hi@smile.ba", "", "No website", "osm"],
  ["Zub", "Dentists", "Titova 2", "+38733444555", "no", "", "https://zub.ba", "Good", "osm"],
  ["Bijeli", "Dentists", "", "", "", "info@bijeli.ba", "", "No website", "osm"],
  ["Nema", "Dentists", "", "—", "", "n/a", "", "", "osm"],
];

describe("sheet counts and the progress line", () => {
  it("finds columns whatever their spelling", () => {
    expect(colIndex(["Name", "E-mail", "whats app"], ["Email"])).toBe(1);
    expect(colIndex(["Name", "E-mail", "whats app"], ["WhatsApp"])).toBe(2);
    expect(colIndex(["Name"], ["Phone"])).toBe(-1);
  });

  it("counts rows, phones, WhatsApp and emails (placeholders don't count)", () => {
    expect(sheetCounts(SHEET)).toEqual({ rows: 4, phones: 2, whatsapp: 1, emails: 2 });
    expect(sheetCounts([])).toEqual({ rows: 0, phones: 0, whatsapp: 0, emails: 0 });
  });

  it("reads '87 / 200 leads · 41 WhatsApp · 12 emails'", () => {
    const p = goalProgress("find at least 200 leads", SHEET);
    expect(p).toMatchObject({ rows: 4, target: 200, unit: "leads" });
    expect(progressLine(p)).toBe("4 / 200 leads · 1 WhatsApp · 2 emails");
    expect(progressLine({ rows: 87, phones: 60, whatsapp: 41, emails: 12, target: 200, unit: "leads" })).toBe("87 / 200 leads · 41 WhatsApp · 12 emails");
  });

  it("with no number in the goal it just counts (lead sheets say leads, others rows)", () => {
    expect(progressLine(goalProgress("dentists in Sarajevo", SHEET))).toBe("4 leads · 1 WhatsApp · 2 emails");
    expect(progressLine(goalProgress("best laptops", [["Model", "Price"], ["X1", "900"]]))).toBe("1 rows");
    expect(progressLine(goalProgress("best laptops", []))).toBe("");
  });

  it("tells the Chief how far the sheet is from the number", () => {
    expect(progressForPrompt(goalProgress("find 200 leads", SHEET))).toMatch(/4 \/ 200 leads.*\(2%\).*196 still to go.*NOT reached until the sheet has 200/);
    expect(progressForPrompt(goalProgress("find 3 leads", SHEET))).toMatch(/target is reached/);
    expect(progressForPrompt(goalProgress("a plan to earn 500 KM", []))).toBe("");
  });
});
