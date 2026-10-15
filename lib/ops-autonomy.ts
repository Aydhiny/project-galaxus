// Full autonomy, the pure part (tested in ops-autonomy.test.ts): which agent
// questions still need YOU, where a question goes, the Chief's prompt and how
// its answer is read, and the deterministic rule used when no model can decide.
// The database side is lib/services/ops-autonomy.ts.

import { parseJsonReply } from "@/lib/claude-jobs";

export const AUTONOMY_MODES = ["full", "ask"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];
export const autonomyOf = (v: unknown): AutonomyMode => (v === "ask" ? "ask" : "full");

/** In "full" mode, at most this many non-urgent questions a day reach you (with a push). The rest wait quietly. */
export const MAX_USER_QUESTIONS_PER_DAY = 1;

/** Things only you decide, even in "full" mode. */
export type UserCategory = "money" | "contact" | "legal" | "private";
export const USER_CATEGORY_LABEL: Record<UserCategory, string> = {
  money: "spending money",
  contact: "contacting a real person",
  legal: "a legal, account or irreversible step",
  private: "sharing your private data",
};

// Matched on lower-case text with diacritics removed (š→s, č/ć→c, ž→z, đ→dj), so
// "pošalji" and "posalji" both match. English + Bosnian/Croatian/Serbian.
// Deliberately broad: a false alarm costs you one tap, a miss could send or buy something.
const PERSON = String.raw`(them|him|her|the (clients?|leads?|customers?|business(es)?|owners?|compan(y|ies)|person|people|dentists?|lawyers?)|this (client|lead|business|person|owner)|these (clients|leads|businesses|people))`;
const PATTERNS: Record<UserCategory, RegExp[]> = {
  money: [
    /\b(buy|buying|bought|purchas\w*|pay|paying|paid|payment\w*|checkout|subscribe|subscription\w*|refund\w*|invoice\w*)\b/,
    /\bplace (an |the )?order\b/,
    /\bspend(ing)? (money|\$|€|\d|on (a|an) )/,
    /\$\s?\d|\d\s?(\$|€)|\b\d+([.,]\d+)?\s?(eur|euro|euros|km|bam|usd|dollars?)\b/,
    /\b(kupi|kupovin|kupuj|plati\b|platiti|platim|platio|placanj|placam|uplat|potros|naruci|narucit|narudzb|pretplat|kartic|transakcij|faktur)/,
  ],
  contact: [
    /\b(send|sending|sent|whatsapp|viber|publish\w*|tweet\w*|reach out|cold.?call\w*)\b/,
    new RegExp(String.raw`\b(e-?mail|mail|message|text|dm|call|phone|contact|reply to|respond to|write to|pitch|follow up with|ping)\s+${PERSON}`),
    /\bpost (it|this|that|them|on|to)\b/,
    /\b(posalj|poslat|salj|slanje|kontaktir|nazov|nazvat|objav|mejlom|mejlat|mejlaj)/,
    /\bjavi(ti)? se\b/,
    /\bodgovor(i|iti) (klijent|kupc|musterij|im\b|mu\b|joj\b|na (mail|mejl|poruk))/,
    /\b(pisi|pisati|napisi) (im|mu|joj|klijent)/,
    /\bporuk(u|e) (klijent|kupc|im\b|mu\b|joj\b)/,
  ],
  legal: [
    /\b(contract\w*|signature|legal\w*|lawsuit|sue|gdpr|tax|taxes|register\w*|registration|password\w*|delet\w*|erase|wipe|irreversibl\w*|permanent\w*|deploy\w*|transfer\w*)\b/,
    /\bsign (up|in|the|this|a|it)\b/,
    /\blog ?in\b/,
    /\bterms (of service|and conditions)\b|\bagree to\b/,
    /\bcreate (an |a )?account\b|\bclose (the |my |your )?account\b/,
    /\bcancel (my |the |your )?(subscription|account|plan|order|contract)\b/,
    /\bcan'?t be undone\b|\bcannot be undone\b/,
    /\bforce.?push\b|\bmerge (to|into) (main|master)\b/,
    /\b(ugovor|potpis|pravn|tuzb|sudsk|porez|registr|nalog|lozink|obris|izbris|brisanj|nepovrat|otkaz)/,
    /\bprijavi(ti)? se\b|\btrajno\b|\bracun(a|u|om)?\b/,
  ],
  private: [
    /\b(personal|private) (data|info|information|details|files|photos|messages)\b/,
    /\b(my|your) (home )?(address|phone|mobile|number|e-?mail|cv|resume|photos?|health|medical|location)\b/,
    /\b(id card|passport|jmbg|iban|bank (account|details)|credit card|social security)\b/,
    /\bshare (my|your)\b/,
    /\b(licn|osobn|privatn)\w* podat|\bprivatn/,
    /\b(lic\w* kart|pasos|bankovn)/,
    /\b(moj|tvoj|vas)(u|a|e|i|eg|ih)? (adres|broj|mail|mejl|cv|slik|lokacij)/,
    /\bpodijeli(ti)? (moj|tvoj|vas)/,
  ],
};

export const normalizeText = (s: string) => s.toLowerCase().replace(/đ/g, "dj").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Does this question need YOU? Returns the category, or null when the Chief may decide.
 * Quoted parts of the question (mission titles, usually) are ignored, so a finder asking which city
 * "Pravnici" should search isn't mistaken for a legal question. The context (the mission's title and
 * brief) is checked for sending and spending only: a question inside a "send the offers" mission is yours.
 */
export function classifyQuestion(o: { question: string; options?: string[]; context?: string | null }): UserCategory | null {
  const q = normalizeText(`${o.question.replace(/"[^"]*"|“[^”]*”|„[^“”]*[“”]/g, " ")} ${(o.options ?? []).join(" ")}`);
  for (const cat of ["money", "contact", "legal", "private"] as const) if (PATTERNS[cat].some((r) => r.test(q))) return cat;
  const ctx = normalizeText(o.context ?? "");
  if (ctx) for (const cat of ["money", "contact"] as const) if (CONTEXT_PATTERNS[cat].some((r) => r.test(ctx))) return cat;
  return null;
}
// In the mission's own text only clear actions count ("buy", "send"): briefs often mention money or people descriptively.
const CONTEXT_PATTERNS: Record<"money" | "contact", RegExp[]> = {
  money: [/\b(buy|purchase|checkout|subscribe|place (an |the )?order|kupi|kupiti|naruci|naruciti|platiti|uplati|uplatiti)\b/],
  contact: [PATTERNS.contact[0], PATTERNS.contact[1], /\b(posalji|poslati|salji|kontaktiraj|kontaktirati|nazovi|objavi|objaviti)\b/],
};

/**
 * Where a question goes:
 *   "direct" → you, with a push (autonomy off, or a caller that must ask you: reply watch)
 *   "chief"  → the Chief decides now
 *   "user"   → you, with a push (only you may decide; today's one question)
 *   "held"   → you, in "Needs you", without a push (only you may decide, but today's question cap is used)
 */
export type QuestionRoute = "direct" | "chief" | "user" | "held";
export function routeQuestion(o: { mode: AutonomyMode; toUser?: boolean; category: UserCategory | null; urgent: boolean; userAskedToday: number }): QuestionRoute {
  if (o.mode === "ask" || o.toUser) return "direct";
  if (!o.category) return "chief";
  if (o.urgent) return "user";
  return o.userAskedToday < MAX_USER_QUESTIONS_PER_DAY ? "user" : "held";
}

/** "Leave it" / "Cancel": the waiting mission stops instead of resuming. */
export const isLeaveIt = (answer: string) => /^(leave it|cancel( it)?|skip( it)?|stop)$/i.test(answer.trim());

/** The "Try again / Leave it" question asked after a mission failed twice. */
export const isRetryQuestion = (options: string[]) => options.some((o) => /^try again$/i.test(o)) && options.some((o) => isLeaveIt(o));
export const isCityQuestion = (question: string) => /\bwhich city\b/i.test(question);

export const DECIDE_YOURSELF = "Decide yourself: make the most reasonable assumption, note it in your deliverable, and carry on.";

/**
 * The Chief's decision when no model could make one (or none is needed):
 * "Try again / Leave it" → try again once, then leave it; "Which city?" → Sarajevo;
 * otherwise the first option (agents put their recommendation first); no options → decide yourself.
 */
export function ruleDecision(o: { question: string; options: string[]; retriesDecided?: number }): { answer: string; why: string } {
  if (isRetryQuestion(o.options)) {
    const again = o.options.find((x) => /^try again$/i.test(x))!, leave = o.options.find((x) => isLeaveIt(x))!;
    return (o.retriesDecided ?? 0) < 1 ? { answer: again, why: "One more try is cheap; if it fails again I'll leave it." } : { answer: leave, why: "It already failed after a retry: leaving it so it stops spending." };
  }
  if (isCityQuestion(o.question)) {
    const sarajevo = o.options.find((x) => /^sarajevo$/i.test(x.trim()));
    if (sarajevo || !o.options.length) return { answer: sarajevo ?? "Sarajevo", why: "Sarajevo: the user's city and the biggest market." };
  }
  if (o.options.length) return { answer: o.options[0], why: "The first option (the agent's own recommendation) keeps the work moving." };
  return { answer: DECIDE_YOURSELF, why: "Nothing here needs the user." };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The prompt for the Chief's decision (free model or Claude). Every input is plain text from the database. */
export function chiefDecidePrompt(o: {
  agent: string; question: string; options: string[];
  mission?: { title: string; brief: string | null } | null; project?: { title: string; goal: string } | null;
  directions?: string; memory?: string; context?: string | null;
}) {
  return {
    system: `You are the Chief of staff of a small AI agent crew working for a student in Sarajevo, Bosnia and Herzegovina, on a tight budget.
An agent asked a question. The user has told you to decide for them, so the work never waits. Decide now, on the user's behalf.
Use the user's directions first, then the project goal and the mission, then what we know about the user. Prefer the choice that keeps work moving, costs nothing and can be undone.
Questions about spending money, contacting real people, legal or account steps, or sharing private data never come to you.
Reply with ONLY a JSON object: {"answer": "<exactly one of the options, copied verbatim; or a short instruction if there are no options>", "why": "<one short sentence>"}`,
    prompt: [
      o.directions || "",
      o.project ? `PROJECT: ${o.project.title}\nGoal: ${clip(o.project.goal, 1200)}` : "",
      o.mission ? `MISSION: ${o.mission.title}${o.mission.brief ? `\nBrief: ${clip(o.mission.brief, 1500)}` : ""}` : "",
      o.context ? `CONTEXT: ${clip(o.context, 1200)}` : "",
      o.memory ? `WHAT WE KNOW ABOUT THE USER:\n${o.memory}` : "",
      `QUESTION from ${o.agent}: ${o.question}`,
      o.options.length ? `OPTIONS: ${o.options.map((x) => `"${x}"`).join(" | ")}` : "OPTIONS: none (answer in one or two sentences)",
    ].filter(Boolean).join("\n\n").slice(0, 12_000),
  };
}

/** Read the Chief's answer. With options it must be one of them (matched loosely); null when it can't be read. */
export function parseChiefDecision(text: string, options: string[]): { answer: string; why: string } | null {
  const clean = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const j = parseJsonReply<{ answer?: unknown; why?: unknown }>(clean);
  const raw = (j?.answer != null ? String(j.answer) : clean.split("\n")[0] ?? "").replace(/^["'“]|["'”]$/g, "").trim();
  const why = clip(String(j?.why ?? "").replace(/\s+/g, " ").trim(), 200);
  if (!raw) return null;
  if (options.length) {
    const lower = raw.toLowerCase();
    const exact = options.find((x) => x.toLowerCase() === lower);
    if (exact) return { answer: exact, why };
    const inside = [...options].sort((a, b) => b.length - a.length).find((x) => lower.includes(x.toLowerCase()));
    return inside ? { answer: inside, why } : null;
  }
  return raw.length >= 2 ? { answer: clip(raw.replace(/\s+/g, " "), 600), why } : null;
}

/** "The Chief made 7 decisions today, 0 need you." */
export function digestLine(decided: number, needsYou: number) {
  return `The Chief made ${decided} decision${decided === 1 ? "" : "s"} today, ${needsYou} need${needsYou === 1 ? "s" : ""} you.`;
}
