import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeEntities, parseCompanyWall, parseKm, pickFirmaLink, worthBonus, type CompanyWallInfo } from "@/lib/companywall";
import { scoreLead } from "@/lib/outreach";

// Real page text (excerpts, see the first line of each file), as Reach's direct route returns it.
const large = readFileSync("lib/__fixtures__/companywall-large.txt", "utf8");
const obrt = readFileSync("lib/__fixtures__/companywall-obrt.txt", "utf8");
const now = new Date("2026-10-15T10:00:00Z");

describe("parseCompanyWall", () => {
  it("reads revenue (with its year), employees, founding year and status from a big company's page", () => {
    const cw = parseCompanyWall(large, "https://www.companywall.ba/firma/bingo-doo-tuzla/MMxIfTs0", now);
    expect(cw).toMatchObject({
      result: "ok", revenueKm: 2_000_000_000 /* clamped to fit the integer column */, revenueYear: 2025, employees: 8370,
      foundedYear: 2001, companyStatus: "Aktivan", active: true, accountBlocked: false,
    });
  });

  it("an obrt publishes no financials: founding and status still count, and it says no_financials", () => {
    const cw = parseCompanyWall(obrt, "https://www.companywall.ba/firma/x/ABC", now);
    expect(cw).toMatchObject({ result: "no_financials", revenueKm: null, employees: null, foundedYear: 2009, active: true, accountBlocked: false });
  });

  it("a struck-off company and a blocked account", () => {
    const text = 'Konkurentne kompanije\n "X" d.o.o.\n Ulica 1, Sarajevo\n Brisan \n JIB \n 1 \n Datum osnivanja \n 1.2.2015. \n Na današnji dan kompanija JE blokirana\n U 2024. godini kompanija je ostvarila ukupan prihod od 45.000,00.';
    expect(parseCompanyWall(text, null, now)).toMatchObject({ companyStatus: "Brisan", active: false, accountBlocked: true, revenueKm: 45_000, revenueYear: 2024 });
  });

  it("falls back to the masked table when the summary sentence is missing", () => {
    const text = "JIB\n1\nDatum osnivanja\n3.3.2020.\nUkupni prihodi \n 120.4XX,XX\n 180.9XX,XX\n Ukupni rashodi\n";
    expect(parseCompanyWall(text, null, now)).toMatchObject({ revenueKm: 180_900, revenueYear: null, foundedYear: 2020 });
  });

  it("a login wall or an error page is 'blocked', not zeros", () => {
    expect(parseCompanyWall("Access denied. Please verify you are human.", null, now)).toMatchObject({ result: "blocked", revenueKm: null, active: null });
  });

  it("helpers: entities and KM amounts", () => {
    expect(decodeEntities("Ra&#x10D;uni &#269; &quot;X&quot;")).toBe('Računi č "X"');
    expect(parseKm("2.308.925.584,00")).toBe(2_308_925_584);
    expect(parseKm("45.000,00")).toBe(45_000);
    expect(parseKm("abc")).toBeNull();
  });
});

describe("pickFirmaLink", () => {
  const html = '<a href="/firma/bingo-doo-tuzla/MMxIfTs0">x</a><a href="/firma/bingo-petrol-doo-tuzla/MMxFekBC">y</a><a href="/firma/aras-doo/MMEIcSGq">z</a>';
  it("picks the link that names the business, preferring its city", () => {
    expect(pickFirmaLink(html, "Bingo d.o.o.", "Tuzla")).toBe("https://www.companywall.ba/firma/bingo-doo-tuzla/MMxIfTs0");
    expect(pickFirmaLink(html, "Bingo Petrol", "Tuzla")).toBe("https://www.companywall.ba/firma/bingo-petrol-doo-tuzla/MMxFekBC");
  });
  it("reads Jina's markdown links too", () => {
    expect(pickFirmaLink("[ARAS d.o.o.](https://www.companywall.ba/firma/aras-doo/MMEIcSGq)", "Aras", null)).toBe("https://www.companywall.ba/firma/aras-doo/MMEIcSGq");
  });
  it("no match rather than a wrong match (legal-form words don't count)", () => {
    expect(pickFirmaLink(html, "Dental Smile d.o.o.", "Sarajevo")).toBeNull();
    expect(pickFirmaLink(html, "d.o.o.", null)).toBeNull();
  });
});

describe("worth contacting", () => {
  const cw = (o: Partial<CompanyWallInfo>): CompanyWallInfo => ({
    result: "ok", url: null, checkedAt: now.toISOString(), revenueKm: null, revenueYear: null, employees: null, foundedYear: 2010,
    companyStatus: "Aktivan", active: true, accountBlocked: false, ...o,
  });

  it("the rule", () => {
    expect(worthBonus({ gaps: ["no_website"], companyWall: null }, now)).toBe(0);
    expect(worthBonus({ gaps: ["no_website"], revenueKm: 250_000, companyWall: cw({}) }, now)).toBe(40); // money + bad site
    expect(worthBonus({ gaps: ["no_booking"], revenueKm: 250_000, companyWall: cw({}) }, now)).toBe(0); // money, site is fine
    expect(worthBonus({ gaps: ["social_only"], companyWall: cw({ employees: 12 }) }, now)).toBe(40); // employees count as money
    expect(worthBonus({ gaps: ["no_website"], revenueKm: 250_000, companyWall: cw({ accountBlocked: true }) }, now)).toBe(-40);
    expect(worthBonus({ gaps: ["no_website"], companyWall: cw({ active: false }) }, now)).toBe(-200);
    expect(worthBonus({ gaps: [], companyWall: cw({ foundedYear: 2025 }) }, now)).toBe(10);
  });

  it("has money and a bad website ranks first, a closed firm last", () => {
    const base = { channel: "whatsapp", reviewCount: 0 };
    const rich = scoreLead({ ...base, gaps: ["no_website"], revenueKm: 300_000, companyWall: cw({}) });
    const poorNoSite = scoreLead({ ...base, gaps: ["no_website"], revenueKm: 20_000, companyWall: cw({}) });
    const unknownNoSite = scoreLead({ ...base, gaps: ["no_website"] });
    const siteBroke = scoreLead({ ...base, gaps: ["site_down"], tags: ["site_broke"] });
    const richGoodSite = scoreLead({ ...base, gaps: ["no_booking"], revenueKm: 300_000, companyWall: cw({}) });
    const closed = scoreLead({ ...base, gaps: ["no_website"], companyWall: cw({ active: false }) });
    expect(rich).toBeGreaterThan(Math.max(unknownNoSite, siteBroke, richGoodSite, poorNoSite));
    expect(closed).toBeLessThan(0);
  });
});
