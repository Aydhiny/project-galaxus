// Live project progress: the number a goal asks for ("find at least 200 leads")
// and how far the merged sheet is toward it. Pure, so it's unit-tested
// (ops-progress.test.ts); the project card and the Chief's review read it.

export type GoalTarget = { count: number; unit: string | null };
export type SheetCounts = { rows: number; phones: number; whatsapp: number; emails: number };
export type ProjectProgress = SheetCounts & { target: number | null; unit: string };

const norm = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Index of the first header cell matching any of `names` (compared without case, spaces or punctuation); -1 if none. */
export function colIndex(header: string[], names: string[]) {
  const want = names.map(norm);
  return header.findIndex((h) => want.includes(norm(h)));
}

// Things a list goal counts. "200 leads", "50 dentists", "a list of 120 salons".
const NOUNS = "leads?|business(?:es)?|compan(?:y|ies)|contacts?|rows?|prospects?|clients?|customers?|places?|shops?|stores?|salons?|clinics?|restaurants?|caf(?:e|é)s?|gyms?|dentists?|doctors?|hotels?|agencies|agency|firms?|entries|records?|emails?|names?|venues?|barbers?|vets?|studios?|offices?|people|owners?|brands?|channels?|creators?|jobs?|gigs?|ideas?|items?";
// A number followed by one of these is money or time, never the target.
const NOT_A_COUNT = /^\s*(?:km|bam|eur|euros?|usd|dollars?|\$|€|%|percent|days?|weeks?|months?|years?|hours?|h\b|minutes?|mins?|am\b|pm\b|x\b|×)/i;

const toInt = (s: string) => Number(s.replace(/[.,](?=\d{3}\b)/g, "").replace(/[.,].*$/, ""));
const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100_000;

/**
 * The numeric target in a project goal, or null when it doesn't name one.
 *   "Find at least 200 leads"    → { count: 200, unit: "leads" }
 *   "50 businesses in Mostar"   → { count: 50, unit: "businesses" }
 *   "find me 1,000"             → { count: 1000, unit: null }
 *   "earn 500 KM in 14 days"    → null
 */
export function parseGoalTarget(goal: string | null | undefined): GoalTarget | null {
  const text = String(goal ?? "").slice(0, 4000);
  // 1. "<N> [up to 3 words] <noun>": the clearest form, and it names the unit.
  const counted = new RegExp(`(?<![\\d$€.,])(\\d{1,3}(?:[.,]\\d{3})+|\\d{1,6})\\+?\\s+((?:[\\p{L}-]+\\s+){0,3}?)(${NOUNS})\\b`, "giu");
  for (const m of text.matchAll(counted)) {
    if (NOT_A_COUNT.test(text.slice(m.index! + m[1].length))) continue;
    // Rates aren't targets: "5 leads per day", "10 per week businesses".
    if (/\b(?:per|each|every)\b/i.test(m[2]) || /^\s*(?:per|a|each|every)\s+(?:day|week|month)\b/i.test(text.slice(m.index! + m[0].length))) continue;
    const n = toInt(m[1]);
    if (ok(n)) return { count: n, unit: m[3].toLowerCase() };
  }
  // 2. "find (me) (at least|about|up to) <N>": a verb that collects, then a bare number.
  const verb = /\b(?:find|collect|gather|get|list|compile|build|scrape|reach|research)\s+(?:me\s+|us\s+)?(?:at\s+least|about|around|roughly|up\s+to|over|some|a\s+list\s+of)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{1,6})\b/gi;
  for (const m of text.matchAll(verb)) {
    if (NOT_A_COUNT.test(text.slice(m.index! + m[0].length))) continue;
    const n = toInt(m[1]);
    if (ok(n)) return { count: n, unit: null };
  }
  return null;
}

/** Counts from a merged sheet ([header, ...rows]): rows, and rows with a phone / WhatsApp / an email. */
export function sheetCounts(sheet: string[][]): SheetCounts {
  if (sheet.length < 2) return { rows: 0, phones: 0, whatsapp: 0, emails: 0 };
  const [header, ...rows] = sheet;
  const phone = colIndex(header, ["Phone", "Telephone", "Tel", "Phone number", "Telefon"]);
  const wa = colIndex(header, ["WhatsApp", "Whats App", "WA"]);
  const email = colIndex(header, ["Email", "E-mail", "Mail", "Email address"]);
  const filled = (r: string[], i: number) => i >= 0 && !!(r[i] ?? "").trim() && !/^[-–—]$|^(n\/?a|none|unknown|no)$/i.test((r[i] ?? "").trim());
  return {
    rows: rows.length,
    phones: rows.filter((r) => filled(r, phone)).length,
    whatsapp: rows.filter((r) => wa >= 0 && /^(yes|y|da|✓|true)$/i.test((r[wa] ?? "").trim())).length,
    emails: rows.filter((r) => filled(r, email)).length,
  };
}

/** What the project card and the Chief see: the sheet's counts against the goal's number. */
export function goalProgress(goal: string | null | undefined, sheet: string[][]): ProjectProgress {
  const t = parseGoalTarget(goal);
  const c = sheetCounts(sheet);
  const leadSheet = sheet.length > 0 && colIndex(sheet[0], ["Phone"]) >= 0;
  return { ...c, target: t?.count ?? null, unit: t?.unit ?? (leadSheet ? "leads" : "rows") };
}

/** "87 / 200 leads · 41 WhatsApp · 12 emails" (no target: "87 leads · …"). Empty when there's nothing to count. */
export function progressLine(p: ProjectProgress) {
  if (!p.rows && !p.target) return "";
  return [
    p.target ? `${p.rows} / ${p.target} ${p.unit}` : `${p.rows} ${p.unit}`,
    p.whatsapp ? `${p.whatsapp} WhatsApp` : "",
    p.emails ? `${p.emails} email${p.emails === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
}

/** One line for the Chief / the lead: where the sheet stands against the number. Empty if the goal has no number and there's no sheet. */
export function progressForPrompt(p: ProjectProgress) {
  if (p.target == null) return p.rows ? `PROGRESS: the merged sheet has ${progressLine(p)} (the goal names no number).` : "";
  const left = Math.max(0, p.target - p.rows);
  return `PROGRESS TOWARD THE TARGET: ${progressLine(p)} in the merged sheet (${Math.round((Math.min(p.rows, p.target) / p.target) * 100)}%). ${left ? `${left} still to go: the goal is NOT reached until the sheet has ${p.target}.` : "The target is reached."}`;
}
