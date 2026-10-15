import { describe, expect, it } from "vitest";
import {
  DECIDE_YOURSELF, MAX_USER_QUESTIONS_PER_DAY, autonomyOf, chiefDecidePrompt, classifyQuestion, digestLine, isRetryQuestion, parseChiefDecision, routeQuestion, ruleDecision,
} from "@/lib/ops-autonomy";

const c = (question: string, options: string[] = [], context?: string) => classifyQuestion({ question, options, context });

describe("which questions still need you", () => {
  it("lets the Chief decide ordinary work questions", () => {
    expect(c("Logos only, or also social media templates?", ["Logos only", "Both"])).toBeNull();
    expect(c(`I couldn't finish "Dentists in Mostar" (2 tries). Should I try again?`, ["Try again", "Leave it"])).toBeNull();
    expect(c(`Which city should "Pravnici u Mostaru" search? The map couldn't find "Banjja Lukka".`, ["Sarajevo", "Banja Luka", "Mostar", "Tuzla"], "Pravnici u Mostaru\nFIND: lawyer @ Banjja Lukka")).toBeNull();
    expect(c("Should I include phone numbers and emails in the table?")).toBeNull();
    expect(c("Koje kolone da stavim: ime, adresa, telefon?")).toBeNull();
    expect(c("Sort the leads by rating or by distance?", ["Rating", "Distance"])).toBeNull();
  });

  it("spending money, in English and Bosnian (with or without diacritics)", () => {
    expect(c("Should I buy the domain for $12?")).toBe("money");
    expect(c("Treba li kupiti hosting na godinu?")).toBe("money");
    expect(c("Da li da platim premium plan?")).toBe("money");
    expect(c("Should I go with the 25 KM plan?")).toBe("money");
    expect(c("Mogu li naručiti uzorke?")).toBe("money");
  });

  it("contacting a real person", () => {
    expect(c("Should I send this email to the dentist?")).toBe("contact");
    expect(c("Da li da pošaljem ponudu klijentu?")).toBe("contact");
    expect(c("Da li da posaljem ponudu?")).toBe("contact");
    expect(c("Can I message them on WhatsApp?")).toBe("contact");
    expect(c("Should I post it on r/forhire?")).toBe("contact");
    expect(c("Da li da kontaktiram vlasnika?")).toBe("contact");
    // A question inside a mission that sends things is yours too.
    expect(c("Formal or friendly tone?", ["Formal", "Friendly"], "Send the offers to 20 dentists")).toBe("contact");
    expect(c("Formal or friendly tone?", ["Formal", "Friendly"], "Find 20 dentists that pay too much for their website")).toBeNull();
  });

  it("legal, account and irreversible steps", () => {
    expect(c("Should I sign the contract?")).toBe("legal");
    expect(c("Da li da potpišem ugovor?")).toBe("legal");
    expect(c("Can I delete the old repo?")).toBe("legal");
    expect(c("Should I create an account on Upwork?")).toBe("legal");
    expect(c("Da li da otvorim račun u banci?")).toBe("legal");
    expect(c("Should I deploy to production?")).toBe("legal");
  });

  it("your private data", () => {
    expect(c("Can I share your phone number with the client?")).not.toBeNull();
    expect(c("Mogu li koristiti tvoje lične podatke u CV-u?")).toBe("private");
    expect(c("Should I put your home address on the site?")).toBe("private");
  });
});

describe("where a question goes", () => {
  it("ask mode and reply watch go straight to you", () => {
    expect(routeQuestion({ mode: "ask", category: null, urgent: false, userAskedToday: 0 })).toBe("direct");
    expect(routeQuestion({ mode: "full", toUser: true, category: null, urgent: false, userAskedToday: 5 })).toBe("direct");
  });
  it("full: the Chief decides the rest; yours are capped at one push a day unless urgent", () => {
    expect(routeQuestion({ mode: "full", category: null, urgent: false, userAskedToday: 9 })).toBe("chief");
    expect(MAX_USER_QUESTIONS_PER_DAY).toBe(1);
    expect(routeQuestion({ mode: "full", category: "money", urgent: false, userAskedToday: 0 })).toBe("user");
    expect(routeQuestion({ mode: "full", category: "money", urgent: false, userAskedToday: 1 })).toBe("held");
    expect(routeQuestion({ mode: "full", category: "contact", urgent: true, userAskedToday: 3 })).toBe("user");
  });
  it("defaults to full", () => {
    expect(autonomyOf(undefined)).toBe("full");
    expect(autonomyOf("ask")).toBe("ask");
    expect(autonomyOf("nonsense")).toBe("full");
  });
});

describe("the deterministic fallback", () => {
  it("try again once, then leave it", () => {
    expect(isRetryQuestion(["Try again", "Leave it"])).toBe(true);
    expect(ruleDecision({ question: "Should I try again?", options: ["Try again", "Leave it"], retriesDecided: 0 }).answer).toBe("Try again");
    expect(ruleDecision({ question: "Should I try again?", options: ["Try again", "Leave it"], retriesDecided: 1 }).answer).toBe("Leave it");
  });
  it("which city → Sarajevo", () => {
    expect(ruleDecision({ question: `Which city should "Lawyers" search?`, options: ["Banja Luka", "Sarajevo", "Mostar"] }).answer).toBe("Sarajevo");
    expect(ruleDecision({ question: "Which city should I search?", options: [] }).answer).toBe("Sarajevo");
  });
  it("otherwise the first option; with none, decide yourself", () => {
    expect(ruleDecision({ question: "Logos only or both?", options: ["Logos only", "Both"] }).answer).toBe("Logos only");
    expect(ruleDecision({ question: "What format do you want?", options: [] }).answer).toBe(DECIDE_YOURSELF);
  });
});

describe("the Chief's answer", () => {
  it("must be one of the options, matched loosely", () => {
    expect(parseChiefDecision('{"answer":"Both","why":"More value for the same work."}', ["Logos only", "Both"])).toEqual({ answer: "Both", why: "More value for the same work." });
    expect(parseChiefDecision('<think>hmm</think>```json\n{"answer":"both"}\n```', ["Logos only", "Both"])?.answer).toBe("Both");
    expect(parseChiefDecision('{"answer":"I would say Logos only, cheaper"}', ["Logos only", "Both"])?.answer).toBe("Logos only");
    expect(parseChiefDecision('{"answer":"Neither"}', ["Logos only", "Both"])).toBeNull();
    expect(parseChiefDecision("", ["A", "B"])).toBeNull();
  });
  it("free text when there are no options", () => {
    expect(parseChiefDecision('{"answer":"Use a two-column table.","why":"Scannable."}', [])).toEqual({ answer: "Use a two-column table.", why: "Scannable." });
  });
  it("the prompt carries directions, the goal, the mission and the options", () => {
    const p = chiefDecidePrompt({
      agent: "Nova", question: "Logos only, or both?", options: ["Logos only", "Both"], mission: { title: "Price my services", brief: "KM prices" },
      project: { title: "First clients", goal: "Land 3 clients" }, directions: "DIRECTIONS FROM THE USER:\n- skip social media", memory: "[about] student",
    });
    expect(p.system).toContain("JSON");
    for (const s of ["skip social media", "Land 3 clients", "MISSION: Price my services", 'OPTIONS: "Logos only" | "Both"', "QUESTION from Nova"]) expect(p.prompt).toContain(s);
  });
  it("digest line", () => {
    expect(digestLine(7, 0)).toBe("The Chief made 7 decisions today, 0 need you.");
    expect(digestLine(1, 1)).toBe("The Chief made 1 decision today, 1 needs you.");
  });
});
