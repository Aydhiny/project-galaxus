import { describe, expect, it } from "vitest";
import { budgetToKm, companyKey, eligibility, extractContactEmail, parseReplyDecision, passesQualityGate, sanitizeLinks } from "./autopilot";

describe("contact emails", () => {
  it("finds plain and obfuscated addresses, skips junk", () => {
    expect(extractContactEmail("Send reels to Jobs@Acme.io thanks")).toBe("jobs@acme.io");
    expect(extractContactEmail("email hiring [at] studio [dot] com")).toBe("hiring@studio.com");
    expect(extractContactEmail("contact: talent (at) brand.co")).toBe("talent@brand.co");
    expect(extractContactEmail("logo@2x.png and noreply@acme.com")).toBeNull();
    expect(extractContactEmail("DM me on reddit")).toBeNull();
  });
  it("treats gmail senders individually, companies by domain", () => {
    expect(companyKey("Bob@gmail.com")).toBe("bob@gmail.com");
    expect(companyKey("jobs@acme.io")).toBe("acme.io");
  });
});

describe("budget vs your website minimum", () => {
  it("converts fixed budgets to KM and ignores rates", () => {
    expect(budgetToKm("$500", 1.8)).toBe(900);
    expect(budgetToKm("€1,000", 1.8)).toBe(1956);
    expect(budgetToKm("$2k", 1.8)).toBe(3600);
    expect(budgetToKm("$25 per short", 1.8)).toBeNull();
    expect(budgetToKm(null)).toBeNull();
  });
});

describe("eligibility", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const base = {
    status: "new", score: 85, scoredBy: "claude", contactEmail: "jobs@acme.io", subject: "Shorts editor", draft: "Hi…",
    budget: null, postedAt: "2026-10-11T08:00:00Z", createdAt: null, profileName: "Short-form video editing",
  };
  const ctx = { now, usdToKm: 1.8, contacted: new Set<string>() };
  const s = { minScore: 70, websiteMinKm: 1500 };
  it("sends a good, invited, unscanned gig", () => expect(eligibility(base, s, ctx)).toEqual({ ok: true }));
  it("refuses everything risky", () => {
    expect(eligibility({ ...base, contactEmail: null }, s, ctx).ok).toBe(false);
    expect(eligibility({ ...base, scoredBy: "keywords", score: 60 }, s, ctx).ok).toBe(true); // keyword bar is 55
    expect(eligibility({ ...base, scoredBy: "keywords", score: 50 }, s, ctx).ok).toBe(false);
    expect(eligibility({ ...base, score: 60 }, s, ctx).ok).toBe(false);
    expect(eligibility(base, s, { ...ctx, contacted: new Set(["acme.io"]) }).ok).toBe(false);
    expect(eligibility({ ...base, postedAt: "2026-10-11T11:30:00Z" }, s, ctx).ok).toBe(false); // < 2h
    expect(eligibility({ ...base, postedAt: "2026-10-05T11:30:00Z" }, s, ctx).ok).toBe(false); // > 72h
    expect(eligibility({ ...base, profileName: "Web development", budget: "$500" }, s, ctx)).toEqual({ ok: false, reason: "budget 900 KM under your 1500 KM minimum" });
  });
});

describe("safety of anything sent automatically", () => {
  it("keeps only your own links", () => {
    expect(sanitizeLinks("See https://plansio.agency/radovi and https://evil.example/x and book https://cal.com/ajdin", ["https://plansio.agency", "https://cal.com/ajdin"]))
      .toBe("See https://plansio.agency/radovi and and book https://cal.com/ajdin");
  });
  it("blocks placeholders and walls of text", () => {
    expect(passesQualityGate("Hi", "Hello [Your Name] I can help with your channel and editing needs right away, quick turnaround and fair price too ok").ok).toBe(false);
    expect(passesQualityGate("Shorts editor for Acme", Array(200).fill("word").join(" ")).ok).toBe(false);
    expect(passesQualityGate("Shorts editor for Acme", Array(60).fill("word").join(" ")).ok).toBe(true);
  });
  it("sends negotiation, scams and unknowns to you", () => {
    expect(parseReplyDecision({ category: "negotiation", needsHuman: false, reason: "", reply: "x" })?.needsHuman).toBe(true);
    expect(parseReplyDecision({ category: "interested", needsHuman: false, reason: "", reply: "x" })?.needsHuman).toBe(false);
    expect(parseReplyDecision({ category: "hack", reply: "x" })?.category).toBe("other");
  });
});

import { classifyReplyRules, companyFrom, ruleReply, templateApplication } from "./autopilot";
describe("works without Claude", () => {
  it("writes a short, personal application from the post", () => {
    const a = templateApplication({ title: "[Hiring] TikTok editor — GlowBrand", body: "Need 20 TikToks a month", budget: "$25 per video", contactEmail: "jobs@glowbrand.com", profileName: "Short-form video editing", senderName: "Ajdin", portfolioUrl: "https://plansio.agency" });
    expect(a.subject).toMatch(/GlowBrand/);
    expect(a.body).toContain("Hi GlowBrand team");
    expect(a.body).toContain("free 30-second sample");
    expect(a.body).toContain("https://plansio.agency");
    expect(passesQualityGate(a.subject, a.body).ok).toBe(true);
    const w = templateApplication({ title: "Landing page for SaaS", body: "Next.js", budget: null, contactEmail: "cto@launchly.io", profileName: "Web development", senderName: "Ajdin", portfolioUrl: "https://plansio.agency" });
    expect(passesQualityGate(w.subject, w.body).ok).toBe(true);
  });
  it("finds the company from title or email domain", () => {
    expect(companyFrom("Web developer — Acme", null)).toBe("Acme");
    expect(companyFrom("Need a site", "hi@studiokit.io")).toBe("Studiokit");
    expect(companyFrom("Need a site", "bob@gmail.com")).toBeNull();
  });
  it("sorts replies conservatively and answers only safe ones", () => {
    expect(classifyReplyRules("I am out of office until Monday").category).toBe("out_of_office");
    expect(classifyReplyRules("Can you do it cheaper? Send the contract").category).toBe("negotiation");
    expect(classifyReplyRules("Sounds good, can we schedule a call?").category).toBe("interested");
    expect(classifyReplyRules("ok").confident).toBe(false);
    const f = { senderName: "Ajdin", portfolioUrl: "https://plansio.agency", bookingUrl: null, websiteMinKm: 1500, video: false };
    expect(ruleReply("What are your rates?", f)).toContain("1500 KM");
    expect(ruleReply("Please send your portfolio", f)).toContain("https://plansio.agency");
    expect(ruleReply("We went with someone else", f)).toBeNull();
  });
});
