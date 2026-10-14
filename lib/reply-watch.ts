// Reply watch — pure parts (tested in reply-watch.test.ts). When a lead
// answers, the Chief drafts your reply and a price; you decide in the Ops
// inbox. The services side is lib/services/reply-watch.ts.
//
// Nothing here sends anything: a draft only ever lands in the lead's message
// field, and you press send on WhatsApp yourself.

import { GAP_META, type Gap } from "@/lib/outreach";

export type ReplyLang = "bcs" | "en"; // Bosnian/Croatian/Serbian, or English

// ─── Language ─────────────────────────────────────────────────────────────────

const BCS_WORDS = new Set([
  "je", "da", "se", "li", "za", "na", "nam", "vam", "vas", "nas", "hvala", "postovani", "poštovani", "dobar", "dan", "pozdrav", "cijena", "cena",
  "koliko", "moze", "može", "molim", "imamo", "sam", "smo", "sto", "što", "sta", "šta", "kada", "kad", "gdje", "gde", "zanima", "ne", "i", "u",
  "ali", "bi", "bismo", "biste", "treba", "trebamo", "stranicu", "stranica", "sajt", "web", "ponuda", "ponudu", "termin", "uredu", "važi", "vazi", "jeste", "nije",
]);
const EN_WORDS = new Set([
  "the", "and", "is", "you", "we", "for", "thanks", "thank", "hello", "hi", "price", "how", "much", "would", "could", "interested", "please",
  "our", "your", "can", "what", "when", "website", "site", "yes", "no", "not", "send", "call", "us", "me", "it", "of", "to", "a", "are", "do",
]);

/**
 * Which language a message is in: Cyrillic or our letters (č ć š ž đ) are a
 * sure sign; otherwise count common words of each. null when it can't tell.
 */
export function detectLanguage(text: string | null | undefined): ReplyLang | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  if (/[Ѐ-ӿ]/.test(t) || /[čćšžđČĆŠŽĐ]/.test(t)) return "bcs";
  let bcs = 0, en = 0;
  for (const w of t.toLowerCase().match(/[a-zčćšžđ']+/g) ?? []) {
    if (BCS_WORDS.has(w)) bcs++;
    if (EN_WORDS.has(w)) en++;
  }
  if (bcs === en) return null;
  return bcs > en ? "bcs" : "en";
}

/** Their reply decides; failing that, the language we wrote to them in; failing that, Bosnian (local businesses). */
export function replyLanguage(theirText: string | null | undefined, ourMessage: string | null | undefined): ReplyLang {
  return detectLanguage(theirText) ?? detectLanguage(ourMessage) ?? "bcs";
}

// ─── Quote ────────────────────────────────────────────────────────────────────

export type QuoteInput = {
  gaps: string[];
  offer?: string | null; // Outreach → your offer, e.g. "web stranice od 900 KM"
  minKm?: number | null; // your website minimum (Autopilot settings)
  theirText?: string | null;
};
export type Quote = { km: number; basis: string[]; budgetKm: number | null };

const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** The first KM/BAM (or €, converted) amount in a text, e.g. "od 900 KM" → 900. */
export function kmIn(text: string | null | undefined): number | null {
  const t = String(text ?? "");
  const m = t.match(/(\d[\d.,]*)\s*(km|bam|konvertibilnih)\b/i) ?? t.match(/(\d[\d.,]*)\s*(€|eur|eura|euro)/i) ?? t.match(/€\s*(\d[\d.,]*)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(/[.,].*$/, ""), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 500_000) return null;
  const eur = /€|eur/i.test(m[0]);
  return Math.round(eur ? n * 1.95583 : n);
}

/**
 * A price in KM from what they need (the audit's gaps, plus what their reply
 * asks for) and your own numbers (the offer's price, else your minimum).
 * Deterministic, so the same lead always gets the same suggestion.
 */
export function suggestQuote(input: QuoteInput): Quote {
  const base = kmIn(input.offer) ?? (input.minKm && input.minKm > 0 ? input.minKm : 1500);
  const gaps = new Set(input.gaps);
  const their = String(input.theirText ?? "").toLowerCase();
  const basis: string[] = [];
  let km: number;
  if (gaps.has("no_website") || gaps.has("social_only") || gaps.has("site_down")) {
    km = base; basis.push("a new website");
  } else if (gaps.has("not_mobile") || gaps.has("outdated")) {
    km = base * 0.8; basis.push("a redesign of their site");
  } else if (gaps.has("no_booking")) {
    km = base * 0.5; basis.push("online booking on their site");
  } else if (gaps.has("no_https")) {
    km = Math.max(150, base * 0.15); basis.push("HTTPS and a check-up");
  } else {
    km = base; basis.push(input.gaps.length ? input.gaps.map((g) => GAP_META[g as Gap]?.label ?? g).join(", ").toLowerCase() : "a website");
  }
  const wantsBooking = /rezervac|booking|termin|zakazivanj|appointment/.test(their);
  if ((gaps.has("no_booking") || wantsBooking) && !basis[0].includes("booking")) { km += base * 0.25; basis.push("online booking"); }
  if (/web\s?shop|webshop|online prodavnic|prodaj\w* online|e-?commerce|online store|shop/.test(their)) { km += base * 0.5; basis.push("a web shop"); }
  if (/engleski|english|više jezika|vise jezika|dvojezi|multilingual|languages/.test(their)) { km += base * 0.1; basis.push("two languages"); }
  // A budget they named: meet it if it's close, never go below 70% of the fair price.
  const budgetKm = kmIn(input.theirText);
  if (budgetKm) {
    const floor = km * 0.7;
    if (budgetKm < km && budgetKm >= floor) { km = budgetKm; basis.push(`their budget of ${budgetKm} KM`); }
  }
  return { km: round50(km), basis, budgetKm };
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export type ReplyDraft = { lang: ReplyLang; reply: string; quoteKm: number | null };

/** A model's answer → a draft. Accepts JSON (fenced or not); anything unusable is null, so the next engine tries. */
export function parseReplyDraft(text: string | null | undefined): ReplyDraft | null {
  const t = String(text ?? "");
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const c of [fenced, t]) {
    if (!c) continue;
    const s = c.indexOf("{"), e = c.lastIndexOf("}");
    if (s === -1 || e <= s) continue;
    let j: Record<string, unknown>;
    try { j = JSON.parse(c.slice(s, e + 1)) as Record<string, unknown>; } catch { continue; }
    const reply = typeof j.reply === "string" ? j.reply.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim() : "";
    if (reply.length < 20 || reply.length > 1500) return null;
    const lang: ReplyLang = j.language === "en" || j.lang === "en" ? "en" : j.language === "bcs" || j.lang === "bcs" ? "bcs" : detectLanguage(reply) ?? "bcs";
    const q = Number(j.quoteKm ?? j.quote_km ?? j.quote);
    return { lang, reply, quoteKm: Number.isFinite(q) && q >= 50 && q <= 100_000 ? Math.round(q) : null };
  }
  return null;
}

/** The model's price only if it stays near ours (it can't invent a number out of thin air). */
export function settleQuote(suggested: number, fromModel: number | null): number {
  return fromModel && fromModel >= suggested * 0.5 && fromModel <= suggested * 2 ? round50(fromModel) : suggested;
}

/**
 * The no-AI reply: short, warm, with the price and a next step. First person
 * present/future only (Bosnian past tense would reveal the sender's gender).
 */
export function templateReply(p: { lang: ReplyLang; name: string; quoteKm: number; basis: string[]; senderName?: string | null }): string {
  const sender = p.senderName?.trim();
  if (p.lang === "en") {
    return [
      `Thank you for getting back to me! For ${p.name} I can build ${p.basis.join(" with ")} for ${p.quoteKm} KM, ready in about two weeks, with a preview before anything goes live.`,
      `Would a 10-minute call this week work to go over the details?`,
      sender ? `Best regards, ${sender}` : "Best regards",
    ].join("\n\n");
  }
  const what = p.basis.map(bcsBasis).join(" uz ");
  return [
    `Hvala Vam na odgovoru! Za ${p.name} mogu uraditi ${what} za ${p.quoteKm} KM, gotovo za otprilike dvije sedmice, a prije objave dobijete pregled.`,
    `Da li Vam odgovara kratak poziv od 10 minuta ove sedmice da dogovorimo detalje?`,
    sender ? `Srdačan pozdrav, ${sender}` : "Srdačan pozdrav",
  ].join("\n\n");
}

function bcsBasis(b: string) {
  const map: Record<string, string> = {
    "a new website": "novu web stranicu", "a redesign of their site": "redizajn web stranice", "online booking on their site": "online rezervacije na stranici",
    "HTTPS and a check-up": "HTTPS i pregled stranice", "online booking": "online rezervacije", "a web shop": "web shop", "two languages": "dvije jezičke verzije", "a website": "web stranicu",
  };
  return map[b] ?? (b.startsWith("their budget") ? `u okviru Vašeg budžeta` : b);
}

/** "Change the price": swap every "<old> KM" in the draft for the new amount. */
export function repriceDraft(reply: string, oldKm: number | null, newKm: number): string {
  if (oldKm) {
    const re = new RegExp(`\\b${oldKm}(?:[.,]00)?\\s*(KM|BAM)\\b`, "gi");
    if (re.test(reply)) return reply.replace(re, `${newKm} KM`);
  }
  const any = /\b\d[\d.,]*\s*(KM|BAM)\b/i;
  if (any.test(reply)) return reply.replace(any, `${newKm} KM`);
  return `${reply}\n\n${detectLanguage(reply) === "en" ? `Price: ${newKm} KM.` : `Cijena: ${newKm} KM.`}`;
}

// ─── The inbox question ───────────────────────────────────────────────────────

export const REPLY_OPTIONS = ["Use this reply", "Change the price", "Not now"] as const;

/** One line of summary, then the draft. The inbox shows it as plain text (≤ 600 chars). */
export function replyQuestion(p: { name: string; lang: ReplyLang; quoteKm: number; basis: string[]; reply: string; theirText?: string | null }) {
  const said = p.theirText?.trim() ? ` They wrote: "${p.theirText.replace(/\s+/g, " ").trim().slice(0, 90)}${p.theirText.length > 90 ? "…" : ""}".` : "";
  const head = `${p.name} replied.${said} Suggested quote: ${p.quoteKm} KM (${p.basis.join(", ")}). Draft (${p.lang === "en" ? "English" : "Bosnian"}):`;
  const room = Math.max(120, 590 - head.length);
  const draft = p.reply.replace(/\s+/g, " ").trim();
  return `${head} ${draft.length > room ? `${draft.slice(0, room - 1)}…` : draft}`;
}

export function priceOptions(km: number) {
  return [...new Set([round50(km * 0.8), km, round50(km * 1.2)])].map((n) => `${n} KM`);
}

export type ReplyAnswer = { kind: "use" } | { kind: "price"; km: number } | { kind: "reprice" } | { kind: "later" } | { kind: "note"; text: string };

/** What you meant: a quick option, a number (a new price), or free text (kept as a note). */
export function parseReplyAnswer(answer: string): ReplyAnswer {
  const a = answer.trim();
  if (/^use( this| it)?( reply)?\b|^(yes|da|ok|okay|send it)\b/i.test(a)) return { kind: "use" };
  if (/^change( the)? price/i.test(a)) return { kind: "reprice" };
  if (/^(not now|later|no|ne|skip|leave it|cancel|stop)\b/i.test(a)) return { kind: "later" };
  const km = kmIn(a) ?? (/^\d{2,6}$/.test(a.replace(/\s/g, "")) ? Number(a.replace(/\s/g, "")) : null);
  if (km && km >= 50 && km <= 100_000) return { kind: "price", km: Math.round(km) };
  return { kind: "note", text: a.slice(0, 500) };
}

// ─── Matching an email to a lead ──────────────────────────────────────────────

const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|gmx|mail|yandex|bih\.net|bih|lol|net|tel\.net|teol\.net|zoho)\./i;

/** "info@smile.ba" ↔ https://www.smile.ba/kontakt — same business. Free-mail addresses never match. */
export function emailMatchesSite(email: string, website: string | null | undefined): boolean {
  const domain = String(email).toLowerCase().split("@")[1]?.trim();
  if (!domain || !website || FREE_MAIL.test(domain)) return false;
  let host: string;
  try { host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase(); } catch { return false; }
  const strip = (h: string) => h.replace(/^www\./, "");
  return strip(host) === strip(domain);
}
