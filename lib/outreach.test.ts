import { describe, expect, it } from "vitest";
import {
  OPT_OUT_LINE, analyzeHtml, batchSizes, gapsFor, isMobileBA, localNow, normalizePhone,
  outreachStats, planSlots, scoreLead, templateMessage, whatsappLink,
} from "./outreach";

describe("phones", () => {
  it("normalises international and national Bosnian numbers to E.164", () => {
    expect(normalizePhone("+387 61 123 456", null)).toBe("+38761123456");
    expect(normalizePhone(null, "033 123 456")).toBe("+38733123456");
    expect(normalizePhone(null, "061/123-4567")).toBe("+387611234567");
    expect(normalizePhone(null, null)).toBeNull();
  });
  it("only treats 06x numbers as WhatsApp-capable mobiles", () => {
    expect(isMobileBA("+38761123456")).toBe(true);
    expect(isMobileBA("+387601234567")).toBe(true);
    expect(isMobileBA("+38733123456")).toBe(false);
  });
  it("builds a prefilled wa.me link with digits only", () => {
    expect(whatsappLink("+38761123456", "Dobar dan & hvala")).toBe("https://wa.me/38761123456?text=Dobar%20dan%20%26%20hvala");
  });
});

describe("website audit", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  const modern = `<html><head><meta name="viewport" content="width=device-width"></head><body>
    <a href="/termini">Zakažite termin online</a> © 2026 Ordinacija</body></html>`;

  it("finds nothing wrong with a modern site that has online booking", () => {
    expect(gapsFor("https://a.ba", analyzeHtml(modern, "https://a.ba/", now))).toEqual([]);
  });
  it("flags missing booking, mobile, old copyright and http", () => {
    const old = "<html><body>Pozovite nas: 033 123 456. Zakažite termin pozivom. Copyright 2017</body></html>";
    expect(gapsFor("http://b.ba", analyzeHtml(old, "http://b.ba/", now))).toEqual(["no_booking", "not_mobile", "outdated", "no_https"]);
  });
  it("recognises booking widgets", () => {
    expect(analyzeHtml('<script src="https://assets.calendly.com/x.js"></script>', "https://c.ba", now).booking).toBe(true);
  });
  it("handles no site, social-only and broken sites", () => {
    expect(gapsFor(null, null)).toEqual(["no_website"]);
    expect(gapsFor("https://www.facebook.com/ordinacija", null)).toEqual(["social_only"]);
    expect(gapsFor("https://down.ba", null)).toEqual(["site_down"]);
  });
});

describe("scoring", () => {
  it("ranks a busy clinic without a site above a small one with a decent site", () => {
    const big = scoreLead({ gaps: ["no_website"], reviewCount: 200, rating: 4.8, channel: "whatsapp" });
    const small = scoreLead({ gaps: ["no_https"], reviewCount: 3, rating: 4.0, channel: "call" });
    expect(big).toBeGreaterThan(small);
  });
  it("uses revenue when known", () => {
    const base = { gaps: ["no_booking"], reviewCount: 20 };
    expect(scoreLead({ ...base, revenueKm: 250_000 })).toBeGreaterThan(scoreLead(base));
    expect(scoreLead({ ...base, revenueKm: 10_000 })).toBeLessThan(scoreLead(base));
  });
});

describe("scheduling", () => {
  it("splits the daily volume across batches", () => {
    expect(batchSizes(15, 3)).toEqual([5, 5, 5]);
    expect(batchSizes(14, 3)).toEqual([5, 5, 4]);
  });
  it("plans random times inside the window, ordered and spread out", () => {
    for (let i = 0; i < 50; i++) {
      const slots = planSlots(3, 8 * 60, 18 * 60);
      expect(slots).toHaveLength(3);
      const mins = slots.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
      expect(mins[0]).toBeGreaterThanOrEqual(480);
      expect(mins[2]).toBeLessThan(1080);
      expect(mins[1] - mins[0]).toBeGreaterThanOrEqual(22);
      expect(mins[2] - mins[1]).toBeGreaterThanOrEqual(22);
    }
  });
  it("plans fewer batches when little of the window is left", () => {
    expect(planSlots(3, 17 * 60 + 30, 18 * 60)).toHaveLength(1);
  });
  it("reads wall-clock time in Sarajevo (CEST in October)", () => {
    const l = localNow("Europe/Sarajevo", new Date("2026-10-09T06:30:00Z"));
    expect(l).toMatchObject({ day: "2026-10-09", time: "08:30", weekday: 5 });
  });
});

describe("template message", () => {
  it("is specific, Bosnian, gender-neutral and ends with the opt-out", () => {
    const { text, variant } = templateMessage(
      { name: "Dental Studio Smile", category: "Dentist", rating: 4.9, reviewCount: 120, gaps: ["no_booking"] },
      "Ajdin"
    );
    expect(variant).toBe("template:no-booking");
    expect(text).toContain("Dental Studio Smile");
    expect(text).toContain("4.9★");
    expect(text).toContain("online zakazivanja");
    expect(text.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(text).not.toMatch(/\b(vidio|vidjela|primijetio|primijetila)\b/);
  });
});

describe("stats", () => {
  it("computes the month's reply rate by variant", () => {
    const s = outreachStats(
      [
        { status: "replied", sentAt: "2026-10-02T09:00:00Z", messageVariant: "a", gaps: ["no_booking"] },
        { status: "sent", sentAt: "2026-10-03T09:00:00Z", messageVariant: "a", gaps: ["no_booking"] },
        { status: "client", sentAt: "2026-10-04T09:00:00Z", messageVariant: "b", gaps: ["no_website"] },
        { status: "replied", sentAt: "2026-09-30T09:00:00Z", messageVariant: "a", gaps: [] },
      ],
      "2026-10"
    );
    expect(s).toMatchObject({ sent: 3, replies: 2, replyRate: 67, meetings: 1, clients: 1 });
    expect(s.byVariant.a).toEqual({ sent: 2, replied: 1 });
  });
});
