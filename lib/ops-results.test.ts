import { describe, expect, it } from "vitest";
import {
  cityOf, emailOf, exportRows, facets, filterRows, mailtoHref, phoneOf, projectStatusLine, safeHref, sheetModel, sheetStats, sortRows, timelineByDay, timelineKind, waHref,
} from "./ops-results";

const HEADER = ["Name", "Category", "Address", "Phone", "WhatsApp", "Email", "Website", "Website status", "Source"];
const SHEET = [
  HEADER,
  ["Zubar Ćosić", "Dentists", "Ferhadija 12, 71000 Sarajevo", "061 123 456", "yes", "info@cosic.ba", "", "No website", "https://www.openstreetmap.org/node/1"],
  ["Salon Lana", "Hair salons", "Kralja Petra 3, Banja Luka", "+387 51 222 333", "no", "", "https://facebook.com/salonlana", "Facebook only", "https://www.openstreetmap.org/node/2"],
  ["Dental Plus", "Dentists", "Titova 5, Sarajevo, Bosnia and Herzegovina", "033 444 555", "no", "kontakt@dentalplus.ba", "http://dentalplus.ba", "Broken (site down)", "javascript:alert(1)"],
  ["Studio Mostar", "Hair salons", "Mostar", "062 987 654", "", "-", "https://studiomostar.ba", "Good", ""],
];

describe("safe links", () => {
  it("only http(s) is ever a link, found anywhere in a cell", () => {
    expect(safeHref("OSM (https://www.openstreetmap.org/node/1)")).toBe("https://www.openstreetmap.org/node/1");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<b>x</b>")).toBeNull();
    expect(safeHref("")).toBeNull();
  });
  it("mailto only for a plain address (no headers smuggled in)", () => {
    expect(emailOf("Email: info@cosic.ba (owner)")).toBe("info@cosic.ba");
    expect(mailtoHref("a@b.ba?bcc=x@y.com")).toBe("mailto:a@b.ba");
    expect(mailtoHref("none")).toBeNull();
  });
  it("WhatsApp: Bosnian mobiles, or a number the sheet says is on WhatsApp", () => {
    expect(phoneOf("061 123 456")).toBe("+38761123456");
    expect(waHref({ e164: "+38761123456", whatsapp: false })).toBe("https://wa.me/38761123456?text=");
    expect(waHref({ e164: "+38733444555", whatsapp: false })).toBeNull(); // a landline
    expect(waHref({ e164: "+38733444555", whatsapp: true })).not.toBeNull();
    expect(waHref({ e164: null, whatsapp: true })).toBeNull();
  });
});

describe("sheetModel", () => {
  const { rows, cols } = sheetModel(SHEET);
  it("finds the columns by name and reads each row", () => {
    expect(cols).toMatchObject({ name: 0, phone: 3, wa: 4, email: 5, website: 6, status: 7, source: 8 });
    expect(rows.map((r) => r.city)).toEqual(["Sarajevo", "Banja Luka", "Sarajevo", "Mostar"]);
    expect(rows.map((r) => r.bucket)).toEqual(["none", "social", "broken", "good"]);
    expect(rows[3].email).toBe(""); // "-" is empty
  });
  it("counts for the header", () => {
    expect(sheetStats(rows)).toEqual({ rows: 4, whatsapp: 2, emails: 2, needWebsite: 3 });
  });
  it("judges the website cell when a table has no status column", () => {
    const m = sheetModel([["Name", "Website"], ["A", ""], ["B", "https://instagram.com/b"], ["C", "https://c.ba"]]);
    expect(m.rows.map((r) => r.bucket)).toEqual(["none", "social", "any"]);
  });
  it("cityOf skips postcodes, countries and street-only addresses", () => {
    expect(cityOf("Ferhadija 12, 71000 Sarajevo")).toBe("Sarajevo");
    expect(cityOf("Titova 5, Tuzla, BiH")).toBe("Tuzla");
    expect(cityOf("Ferhadija 12")).toBe("");
  });
});

describe("filterRows", () => {
  const { rows } = sheetModel(SHEET);
  const names = (f: Parameters<typeof filterRows>[1]) => filterRows(rows, f).map((r) => r.name);
  it("searches every word, ignoring case and diacritics", () => {
    expect(names({ q: "cosic" })).toEqual(["Zubar Ćosić"]);
    expect(names({ q: "dentists sarajevo" })).toEqual(["Zubar Ćosić", "Dental Plus"]);
    expect(names({ q: "nothing-like-this" })).toEqual([]);
  });
  it("chips", () => {
    expect(names({ whatsapp: true })).toEqual(["Zubar Ćosić", "Studio Mostar"]);
    expect(names({ email: true })).toEqual(["Zubar Ćosić", "Dental Plus"]);
    expect(names({ noWebsite: true })).toEqual(["Zubar Ćosić"]);
    expect(names({ facebookOnly: true })).toEqual(["Salon Lana"]);
    expect(names({ badWebsite: true })).toEqual(["Dental Plus"]);
    expect(names({ city: "Sarajevo", category: "Dentists", email: true })).toEqual(["Zubar Ćosić", "Dental Plus"]);
  });
  it("facets: most common first", () => {
    expect(facets(rows, "city")).toEqual([{ value: "Sarajevo", count: 2 }, { value: "Banja Luka", count: 1 }, { value: "Mostar", count: 1 }]);
  });
});

describe("sortRows", () => {
  const { rows } = sheetModel(SHEET);
  it("by a column both ways, empty cells last, and back to the sheet's order with no sort", () => {
    expect(sortRows(rows, { col: 0, dir: "asc" }).map((r) => r.name)).toEqual(["Dental Plus", "Salon Lana", "Studio Mostar", "Zubar Ćosić"]);
    expect(sortRows(rows, { col: 0, dir: "desc" }).map((r) => r.name)).toEqual(["Zubar Ćosić", "Studio Mostar", "Salon Lana", "Dental Plus"]);
    expect(sortRows(rows, { col: 5, dir: "desc" }).map((r) => r.name).slice(-2)).toEqual(["Salon Lana", "Studio Mostar"]); // empty emails last ("-" is empty too), in sheet order
    expect(sortRows(rows, null)).toBe(rows);
  });
  it("numbers sort as numbers", () => {
    const m = sheetModel([["Name", "Reviews"], ["a", "10"], ["b", "9"], ["c", "100"]]);
    expect(sortRows(m.rows, { col: 1, dir: "asc" }).map((r) => r.name)).toEqual(["b", "a", "c"]);
  });
  it("exports the visible rows with the header", () => {
    const { header } = sheetModel(SHEET);
    const out = exportRows(header, filterRows(rows, { facebookOnly: true }));
    expect(out).toEqual([HEADER, SHEET[2]]);
  });
});

describe("timeline", () => {
  it("names what happened from the words", () => {
    expect(timelineKind("Leads in Sarajevo · day 2/7\nToday: dentists")).toBe("plan");
    expect(timelineKind('For you today: "Find dentists"')).toBe("handoff");
    expect(timelineKind("Delivered the sheet")).toBe("delivery");
    expect(timelineKind("✓ Good rows, 40 with phones")).toBe("review");
    expect(timelineKind("The finder failed: timeout")).toBe("error");
    expect(timelineKind("Reading a page", "read")).toBe("work");
    expect(timelineKind("hi team", "message")).toBe("radio");
  });
  it("groups by day, newest day first, oldest first inside a day", () => {
    const days = timelineByDay([
      { at: "2026-10-14T09:00:00.000Z", kind: "plan", who: "Chief", text: "a" },
      { at: "2026-10-15T10:00:00.000Z", kind: "delivery", who: "Nova", text: "c" },
      { at: "2026-10-15T08:00:00.000Z", kind: "plan", who: "Chief", text: "b" },
    ]);
    expect(days.map((d) => [d.day, d.items.map((i) => i.text)])).toEqual([["2026-10-15", ["b", "c"]], ["2026-10-14", ["a"]]]);
  });
  it("status line", () => {
    expect(projectStatusLine({ status: "active", phase: "working", dayNo: 3, totalDays: 7, daysLeft: 4 })).toBe("Day 3 of 7 · 4 days left");
    expect(projectStatusLine({ status: "done", phase: "over", dayNo: 9, totalDays: 7, daysLeft: 0 })).toBe("Done: final result ready");
    expect(projectStatusLine({ status: "paused", phase: "working", dayNo: 3, totalDays: 7, daysLeft: 4 })).toBe("Paused");
  });
});
