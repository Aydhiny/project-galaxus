import { describe, expect, it } from "vitest";
import {
  detectLanguage, emailMatchesSite, kmIn, parseReplyAnswer, parseReplyDraft, priceOptions, replyLanguage, replyQuestion, repriceDraft, settleQuote,
  suggestQuote, templateReply,
} from "./reply-watch";
import { buildPoolIndex, partnerNote, shortDay } from "./lead-pool";

describe("detectLanguage", () => {
  it("knows Bosnian/Croatian/Serbian by letters, Cyrillic or common words", () => {
    expect(detectLanguage("Može, koliko bi to koštalo?")).toBe("bcs");
    expect(detectLanguage("Здраво, колико кошта сајт?")).toBe("bcs");
    expect(detectLanguage("Dobar dan, zanima nas cijena za stranicu")).toBe("bcs");
  });
  it("knows English", () => {
    expect(detectLanguage("Hi, how much would a website cost for us?")).toBe("en");
    expect(detectLanguage("Thanks, we are interested. Can you send the price?")).toBe("en");
  });
  it("says null when it can't tell", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("ok 👍")).toBeNull();
  });
  it("falls back to the language we wrote in, then Bosnian", () => {
    expect(replyLanguage("ok", "Hello, I build websites for clinics and you can book online")).toBe("en");
    expect(replyLanguage(null, null)).toBe("bcs");
    expect(replyLanguage("Hi, what would it cost?", "Dobar dan, ja sam Ajdin")).toBe("en"); // their language wins
  });
});

describe("suggestQuote", () => {
  it("uses the price in your offer for a new website", () => {
    expect(suggestQuote({ gaps: ["no_website"], offer: "Web stranice od 900 KM, gotove za 2 sedmice" })).toMatchObject({ km: 900, basis: ["a new website"] });
  });
  it("falls back to your minimum, then 1500 KM", () => {
    expect(suggestQuote({ gaps: ["no_website"], minKm: 1200 }).km).toBe(1200);
    expect(suggestQuote({ gaps: ["social_only"] }).km).toBe(1500);
  });
  it("prices smaller jobs lower and adds what their reply asks for", () => {
    expect(suggestQuote({ gaps: ["outdated"], minKm: 1000 }).km).toBe(800);
    expect(suggestQuote({ gaps: ["no_booking"], minKm: 1000 })).toMatchObject({ km: 500, basis: ["online booking on their site"] });
    const q = suggestQuote({ gaps: ["no_website"], minKm: 1000, theirText: "Treba nam i online rezervacija termina i engleski jezik" });
    expect(q.basis).toEqual(["a new website", "online booking", "two languages"]);
    expect(q.km).toBe(1350);
  });
  it("meets a budget they name if it's close, never far below", () => {
    expect(suggestQuote({ gaps: ["no_website"], minKm: 1000, theirText: "Budžet nam je 800 KM" })).toMatchObject({ km: 800, budgetKm: 800 });
    expect(suggestQuote({ gaps: ["no_website"], minKm: 1000, theirText: "Imamo 300 KM" })).toMatchObject({ km: 1000, budgetKm: 300 });
  });
  it("reads KM and euro amounts", () => {
    expect(kmIn("od 1.500 KM")).toBe(1500);
    expect(kmIn("about 500 EUR")).toBe(978);
    expect(kmIn("nothing")).toBeNull();
  });
});

describe("drafts", () => {
  it("parses a model's JSON, fenced or not", () => {
    const d = parseReplyDraft('```json\n{"language":"bcs","reply":"Hvala Vam na odgovoru! Cijena je 900 KM.","quoteKm":900}\n```');
    expect(d).toEqual({ lang: "bcs", reply: "Hvala Vam na odgovoru! Cijena je 900 KM.", quoteKm: 900 });
    expect(parseReplyDraft('Sure: {"reply":"Thanks for getting back to me, the price is 900 KM.","quoteKm":"abc"}')).toMatchObject({ lang: "en", quoteKm: null });
  });
  it("rejects what can't be used", () => {
    expect(parseReplyDraft("no json here")).toBeNull();
    expect(parseReplyDraft('{"reply":"too short"}')).toBeNull();
    expect(parseReplyDraft("{broken")).toBeNull();
  });
  it("keeps the model's price only near ours", () => {
    expect(settleQuote(1000, 1180)).toBe(1200);
    expect(settleQuote(1000, 90)).toBe(1000);
    expect(settleQuote(1000, null)).toBe(1000);
  });
  it("writes a template in their language, with the price and no gendered past tense", () => {
    const bs = templateReply({ lang: "bcs", name: "Smile", quoteKm: 900, basis: ["a new website", "online booking"], senderName: "Ajdin" });
    expect(bs).toContain("900 KM");
    expect(bs).toContain("novu web stranicu uz online rezervacije");
    expect(bs).toMatch(/Srdačan pozdrav, Ajdin$/);
    expect(bs).not.toMatch(/\b(napravio|napravila|uradio|uradila)\b/);
    expect(templateReply({ lang: "en", name: "Smile", quoteKm: 900, basis: ["a new website"] })).toContain("for 900 KM");
  });
  it("reprices a draft", () => {
    expect(repriceDraft("Cijena je 900 KM, a održavanje 50 KM.", 900, 750)).toBe("Cijena je 750 KM, a održavanje 50 KM.");
    expect(repriceDraft("The price is 900 BAM.", null, 1000)).toBe("The price is 1000 KM.");
    expect(repriceDraft("Hvala Vam, javljam se uskoro.", null, 600)).toBe("Hvala Vam, javljam se uskoro.\n\nCijena: 600 KM.");
  });
  it("builds a one-line question that fits the inbox", () => {
    const q = replyQuestion({ name: "Smile", lang: "bcs", quoteKm: 900, basis: ["a new website"], reply: "x ".repeat(500), theirText: "Koliko košta?" });
    expect(q.length).toBeLessThanOrEqual(600);
    expect(q).toMatch(/^Smile replied\. They wrote: "Koliko košta\?"\. Suggested quote: 900 KM \(a new website\)\. Draft \(Bosnian\):/);
    expect(priceOptions(900)).toEqual(["700 KM", "900 KM", "1100 KM"]);
  });
});

describe("parseReplyAnswer", () => {
  it("understands the quick answers, a number, or a note", () => {
    expect(parseReplyAnswer("Use this reply")).toEqual({ kind: "use" });
    expect(parseReplyAnswer("Change the price")).toEqual({ kind: "reprice" });
    expect(parseReplyAnswer("Not now")).toEqual({ kind: "later" });
    expect(parseReplyAnswer("750 KM")).toEqual({ kind: "price", km: 750 });
    expect(parseReplyAnswer("1200")).toEqual({ kind: "price", km: 1200 });
    expect(parseReplyAnswer("Call them instead, they prefer phone")).toEqual({ kind: "note", text: "Call them instead, they prefer phone" });
  });
});

describe("emailMatchesSite", () => {
  it("matches the lead's own domain, never free mail", () => {
    expect(emailMatchesSite("info@smile.ba", "https://www.smile.ba/kontakt")).toBe(true);
    expect(emailMatchesSite("dr@smile.ba", "smile.ba")).toBe(true);
    expect(emailMatchesSite("smile@gmail.com", "https://gmail.com")).toBe(false);
    expect(emailMatchesSite("info@other.ba", "https://smile.ba")).toBe(false);
    expect(emailMatchesSite("info@smile.ba", null)).toBe(false);
  });
});

describe("lead pool (pure)", () => {
  const contacts = [
    { name: "Stomatološka ordinacija Smile d.o.o.", phone: "+38761111111", city: "Sarajevo", who: "Faruk", sentAt: new Date("2026-10-12T09:00:00Z"), queuedFor: null },
    { name: "Dental Art", phone: null, city: "Mostar", who: "Faruk", sentAt: null, queuedFor: "2026-10-15" },
  ];
  const idx = buildPoolIndex(contacts);
  it("matches by phone or by business name in the same city", () => {
    expect(idx.match({ name: "Something else", phone: "+38761111111", city: null })).toEqual({ who: "Faruk", note: "Faruk contacted this on 12 Oct" });
    expect(idx.match({ name: "Stomatološka ordinacija Smile", phone: null, city: "Sarajevo" })?.note).toBe("Faruk contacted this on 12 Oct");
    expect(idx.match({ name: "Dental Art", phone: null, city: "Mostar" })?.note).toBe("Faruk has this in their send list for 15 Oct");
  });
  it("doesn't match a same-named business in another city", () => {
    expect(idx.match({ name: "Dental Art", phone: null, city: "Tuzla" })).toBeNull();
    expect(idx.match({ name: "New Place", phone: "+38762222222", city: "Sarajevo" })).toBeNull();
  });
  it("formats days and notes", () => {
    expect(shortDay("2026-01-03")).toBe("3 Jan");
    expect(partnerNote({ who: "Faruk", sentAt: null, queuedFor: null })).toBe("Faruk has this in their send list");
  });
});
