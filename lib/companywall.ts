// CompanyWall BiH (companywall.ba): what a company's PUBLIC page shows —
// revenue (prihod), employees, founding date, active/blocked — and how that
// folds into "worth contacting". Pure (no I/O), so it's unit-tested
// (companywall.test.ts); lib/services/outreach-bridge.ts does the fetching.

export type CompanyWallResult = "ok" | "no_financials" | "no_match" | "blocked";

/** Stored on leads.company_wall. `result` says how far we got, so a failure is recorded, not retried forever. */
export type CompanyWallInfo = {
  result: CompanyWallResult;
  url: string | null;
  checkedAt: string;
  revenueKm: number | null;
  revenueYear: number | null;
  employees: number | null;
  foundedYear: number | null;
  /** The badge under the name: "Aktivan", "Brisan", "U likvidaciji"… */
  companyStatus: string | null;
  active: boolean | null;
  /** Bank account blocked today ("kompanija JE blokirana"). */
  accountBlocked: boolean | null;
  error?: string;
};

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Legal-form words say nothing about WHICH company it is, so they don't count as a match.
const NOISE = new Set(["doo", "d-o-o", "obrt", "szr", "pzu", "zu", "dd", "sp", "export", "import", "salon", "studio", "centar", "the"]);

/**
 * The best /firma/ link on a CompanyWall search page (HTML hrefs, or Jina's
 * markdown links). Null unless the link names the business: a wrong match would
 * pin someone else's revenue on this lead.
 */
export function pickFirmaLink(page: string, name: string, city?: string | null): string | null {
  const links = [...new Set([...page.matchAll(/(?:https?:\/\/(?:www\.)?companywall\.ba)?(\/firma\/[a-z0-9-]+\/[A-Za-z0-9]+)/g)].map((m) => m[1]))];
  const words = slug(name).split("-").filter((w) => w.length > 2 && !NOISE.has(w));
  if (!links.length || !words.length) return null;
  const c = city ? slug(city) : "";
  const need = Math.min(2, words.length);
  const scored = links
    .map((l) => { const s = l.split("/")[2]; const hits = words.filter((w) => s.includes(w)).length; return { l, hits, score: hits * 2 + (c && s.includes(c) ? 3 : 0) }; })
    .filter((x) => x.hits >= need)
    .sort((a, b) => b.score - a.score);
  return scored[0] ? `https://www.companywall.ba${scored[0].l}` : null;
}

/** &#x161; / &#269; / &quot; → characters (the direct route's text keeps entities). */
export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}

/** "2.308.925.584,00" → 2308925584; masked "2.308.925.5XX,XX" → 2308925500. */
export function parseKm(raw: string): number | null {
  const s = raw.trim().replace(/X/gi, "0");
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return null;
  const n = Number(s.split(",")[0].replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

const INT_MAX = 2_000_000_000; // leads.revenue_km is a Postgres integer

/** Read what's publicly visible on a /firma/ page (text from the direct route, Jina or Exa). */
export function parseCompanyWall(rawText: string, url: string | null, now = new Date()): CompanyWallInfo {
  const t = decodeEntities(rawText).replace(/[ \t]+/g, " ");
  const base: CompanyWallInfo = {
    result: "ok", url, checkedAt: now.toISOString(), revenueKm: null, revenueYear: null, employees: null, foundedYear: null,
    companyStatus: null, active: null, accountBlocked: null,
  };
  // Not a company page at all (a login wall, a captcha, an error page).
  if (!/Datum osnivanja|JIB/i.test(t)) return { ...base, result: "blocked", error: "No company data on the page (blocked or changed)." };

  // Revenue: the summary sentence names the year; the FAQ and the (masked) table are fallbacks.
  const sentence = t.match(/U (\d{4})\. godini kompanija je ostvarila ukupan prihod od ([\d.,X]+)/i);
  const faq = t.match(/Ukupni prihodi kompanije su ([\d.,X]+)/i);
  const table = t.match(/Ukupni prihodi\s*\n?((?:\s*[\d.]+[\dX.]*,[\dX]{2}\s*\n?)+)/i);
  let revenue: number | null = null, revenueYear: number | null = null;
  if (sentence) { revenue = parseKm(sentence[2].replace(/\.$/, "")); revenueYear = Number(sentence[1]); }
  else if (faq) revenue = parseKm(faq[1].replace(/\.$/, ""));
  else if (table) { const vals = table[1].trim().split(/\s+/); revenue = parseKm(vals[vals.length - 1]); }

  const emp = t.match(/zapošljava ukupno (\d[\d.]*) radnik/i) ?? t.match(/kompanija ima (\d[\d.]*) zaposlen/i);
  const employees = emp ? Number(emp[1].replace(/\./g, "")) : null;

  const founded = t.match(/Datum osnivanja\s*:?\s*\n?\s*\d{1,2}\.\s?\d{1,2}\.\s?(\d{4})/i);
  // The status badge sits between the address and "JIB" (bank accounts further down also say "Aktivan").
  const head = t.slice(0, Math.max(0, t.search(/\bJIB\b/)));
  const badge = head.match(/\n\s*(Aktivan|Neaktivan|Brisan|Ugašen|U likvidaciji|U stečaju|Likvidiran|Blokiran)\s*\n/i)?.[1] ?? null;
  const inactive = /Brisan|Ugašen|Neaktivan|Likvid|stečaj/i.test(badge ?? "") || /\n\s*U (stečaju|likvidaciji)\s*\n/i.test(t);
  const blocked = /kompanija JE blokirana/i.test(t) ? true : /kompanija NIJE blokirana|Nije u blokadi/i.test(t) ? false : null;

  const info: CompanyWallInfo = {
    ...base,
    revenueKm: revenue == null ? null : Math.min(INT_MAX, Math.round(revenue)),
    revenueYear,
    employees: employees != null && Number.isFinite(employees) ? employees : null,
    foundedYear: founded ? Number(founded[1]) : null,
    companyStatus: badge,
    active: badge ? !inactive : inactive ? false : null,
    accountBlocked: blocked,
  };
  // Small firms (obrti) publish no financials: say so, so nobody waits for numbers that won't come.
  if (info.revenueKm == null && info.employees == null) info.result = "no_financials";
  return info;
}

const BAD_SITE = ["no_website", "social_only", "site_down", "outdated", "not_mobile"];

/**
 * What CompanyWall adds to a lead's score (on top of scoreLead's revenue rule):
 *   closed / struck off      → -200 (never worth a message)
 *   account blocked today    → -40  (can't pay right now)
 *   has money + bad website  → +40  (the best lead there is: can pay AND needs you)
 *   founded in the last 2 y  → +10  (new firms still need everything)
 * "Has money" = revenue ≥ 100,000 KM or ≥ 10 employees.
 */
export function worthBonus(l: { gaps: string[]; revenueKm?: number | null; companyWall?: CompanyWallInfo | null }, now = new Date()): number {
  const cw = l.companyWall;
  if (!cw) return 0;
  if (cw.active === false) return -200;
  let bonus = 0;
  if (cw.accountBlocked) bonus -= 40;
  const revenue = l.revenueKm ?? cw.revenueKm;
  const money = (revenue ?? 0) >= 100_000 || (cw.employees ?? 0) >= 10;
  if (money && !cw.accountBlocked && l.gaps.some((g) => BAD_SITE.includes(g))) bonus += 40;
  if (cw.foundedYear && cw.foundedYear >= now.getFullYear() - 2) bonus += 10;
  return bonus;
}
