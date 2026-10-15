// The project results page, pure part (tested in ops-results.test.ts): a merged
// lead sheet ([header, ...rows]) → rows the table can search, filter and sort,
// safe links for each cell, and the project timeline grouped by day. No I/O, so
// the same code runs in the browser table and in the server loader's counts.

import { isMobileBA, isSocialUrl, normalizePhone, whatsappLink } from "@/lib/outreach";
import { statusBucket, type WebsiteBucket } from "@/lib/ops-learning";
import { colIndex } from "@/lib/ops-progress";

export type SheetRow = {
  i: number; // position in the merged sheet (stable key)
  cells: string[]; // the row as delivered (exported as is)
  name: string; category: string; address: string; city: string;
  phone: string; e164: string | null; whatsapp: boolean; email: string;
  website: string; websiteStatus: string; bucket: WebsiteBucket; source: string;
  text: string; // everything, folded for search
};

export type SheetFilter = {
  q?: string;
  whatsapp?: boolean; email?: boolean; noWebsite?: boolean; facebookOnly?: boolean; badWebsite?: boolean;
  city?: string; category?: string;
};
export type SheetSort = { col: number; dir: "asc" | "desc" } | null;

/** Lowercase, no diacritics ("Đ" → "d" too), so "cevapi" finds "Ćevapi". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

const EMPTY = /^[-–—]$|^(n\/?a|none|unknown|no|nema)$/i;
const cell = (r: string[], i: number) => { const v = i >= 0 ? (r[i] ?? "").trim() : ""; return EMPTY.test(v) ? "" : v; };

/** The first http(s) URL in a cell ("OSM (https://…)" → "https://…"), or null. Anything else (javascript:, data:) is never a link. */
export function safeHref(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/https?:\/\/[^\s)<>"']+/i);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

/** The first plain email address in a cell, or "" (no spaces, quotes or extra headers, so a mailto: can't be steered). */
export function emailOf(text: string | null | undefined): string {
  return String(text ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
}
export const mailtoHref = (email: string) => (emailOf(email) ? `mailto:${emailOf(email)}` : null);

/** A phone cell ("061 123 456", "+387 61 123 456; 033 …") → E.164, or null. */
export function phoneOf(raw: string | null | undefined): string | null {
  for (const part of String(raw ?? "").split(/[;,/]| or | ili /)) {
    const d = part.replace(/[^\d+]/g, "");
    if (!d) continue;
    const p = d.startsWith("+") ? normalizePhone(d, null) : normalizePhone(null, d.replace(/^00387/, "0").replace(/^387/, "0"));
    if (p) return p;
  }
  return null;
}

/** Click-to-chat for a row: Bosnian mobiles always, other numbers only when the sheet says they're on WhatsApp. */
export function waHref(r: Pick<SheetRow, "e164" | "whatsapp">): string | null {
  if (!r.e164) return null;
  return isMobileBA(r.e164) || r.whatsapp ? whatsappLink(r.e164, "") : null;
}

const COUNTRY = /^(bosnia(\s+and|\s*&)?\s+herzegovina|bih|b&h|bosna i hercegovina|serbia|srbija|croatia|hrvatska|montenegro|crna gora)$/i;
/** The town of an address: its last comma part that isn't a country or a postcode ("Ferhadija 12, 71000 Sarajevo" → "Sarajevo"). */
export function cityOf(address: string): string {
  const parts = address.split(",").map((p) => p.replace(/\b\d{5}\b/g, "").trim()).filter(Boolean);
  while (parts.length && COUNTRY.test(parts[parts.length - 1])) parts.pop();
  const last = parts[parts.length - 1] ?? "";
  // One part with a house number is a street, not a town.
  if (!last || /\d/.test(last) || last.length > 40) return "";
  return last;
}

/** The merged sheet → table rows. Columns are found by name, in any order (other agents' tables differ). */
export type SheetCols = Record<"name" | "category" | "address" | "phone" | "wa" | "email" | "website" | "status" | "source", number>;
export function sheetModel(sheet: string[][]): { header: string[]; cols: SheetCols; rows: SheetRow[] } {
  const header = sheet[0] ?? [];
  const body = sheet.slice(1);
  const c: SheetCols = {
    name: colIndex(header, ["Name", "Business", "Company", "Naziv", "Firma"]),
    category: colIndex(header, ["Category", "Type", "Kategorija", "Djelatnost"]),
    address: colIndex(header, ["Address", "Adresa", "City", "Location", "Grad"]),
    phone: colIndex(header, ["Phone", "Telephone", "Tel", "Phone number", "Telefon"]),
    wa: colIndex(header, ["WhatsApp", "Whats App", "WA"]),
    email: colIndex(header, ["Email", "E-mail", "Mail", "Email address"]),
    website: colIndex(header, ["Website", "Web", "Site", "Web stranica"]),
    status: colIndex(header, ["Website status", "Site status", "Status"]),
    source: colIndex(header, ["Source", "Izvor", "Link", "Map"]),
  };
  const rows = body.map((r, i): SheetRow => {
    const phone = cell(r, c.phone), website = cell(r, c.website), websiteStatus = cell(r, c.status), address = cell(r, c.address);
    // No status column (another agent's table): judge by the website cell alone.
    let bucket = c.status >= 0 ? statusBucket(websiteStatus) : "any";
    if (bucket === "any") bucket = !website ? (c.website >= 0 ? "none" : "any") : isSocialUrl(safeHref(website) ?? "") ? "social" : "any";
    return {
      i, cells: r, name: cell(r, c.name >= 0 ? c.name : 0), category: cell(r, c.category), address, city: cityOf(address),
      phone, e164: phoneOf(phone), whatsapp: /^(yes|y|da|✓|true)$/i.test(cell(r, c.wa)), email: emailOf(cell(r, c.email)),
      website, websiteStatus, bucket, source: cell(r, c.source),
      text: fold(r.join(" ")),
    };
  });
  return { header, cols: c, rows };
}

export const needsWebsite = (r: Pick<SheetRow, "bucket">) => r.bucket === "none" || r.bucket === "social" || r.bucket === "broken";

/** Search (every word must appear, any order, diacritics ignored) and the filter chips. */
export function filterRows(rows: SheetRow[], f: SheetFilter): SheetRow[] {
  const words = fold(f.q ?? "").split(/\s+/).filter(Boolean);
  return rows.filter((r) =>
    words.every((w) => r.text.includes(w))
    && (!f.whatsapp || !!waHref(r))
    && (!f.email || !!r.email)
    && (!f.noWebsite || r.bucket === "none")
    && (!f.facebookOnly || r.bucket === "social")
    && (!f.badWebsite || r.bucket === "broken" || r.bucket === "weak")
    && (!f.city || r.city === f.city)
    && (!f.category || r.category === f.category));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
/** Sorted by one column; empty cells always last, ties keep the sheet's order. Returns a new array. */
export function sortRows(rows: SheetRow[], s: SheetSort): SheetRow[] {
  if (!s) return rows;
  const k = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = cell(a.cells, s.col), y = cell(b.cells, s.col); // "-" and "n/a" count as empty
    if (!x !== !y) return x ? -1 : 1;
    return (collator.compare(x, y) * k) || a.i - b.i;
  });
}

/** "Sarajevo (41)" chips: the most common values first, at most `max`. */
export function facets(rows: SheetRow[], key: "city" | "category", max = 12) {
  const n = new Map<string, number>();
  for (const r of rows) if (r[key]) n.set(r[key], (n.get(r[key]) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])).slice(0, max).map(([value, count]) => ({ value, count }));
}

/** Counts for the header: rows with WhatsApp / an email, and the ones that need a website. */
export function sheetStats(rows: SheetRow[]) {
  return {
    rows: rows.length,
    whatsapp: rows.filter((r) => !!waHref(r)).length,
    emails: rows.filter((r) => !!r.email).length,
    needWebsite: rows.filter(needsWebsite).length,
  };
}

/** The visible rows as a sheet again ([header, ...rows]), for the Excel export. */
export const exportRows = (header: string[], rows: SheetRow[]) => [header, ...rows.map((r) => header.map((_, k) => r.cells[k] ?? ""))];

/** The project's state in a few words (the same wording as the project card in Ops). */
export function projectStatusLine(p: { status: string; finishing?: boolean; phase: string; dayNo: number; totalDays: number; daysLeft: number }) {
  if (p.status === "done") return "Done: final result ready";
  if (p.status === "paused") return "Paused";
  if (p.status === "cancelled") return "Cancelled";
  if (p.finishing) return "Finishing: the lead is writing the final result";
  if (p.phase === "not started") return `Starts soon · ${p.totalDays} days`;
  if (p.phase === "over") return "Overdue: keeps working until it has results";
  if (p.phase === "final") return `Day ${p.totalDays} of ${p.totalDays} · deadline today`;
  return `Day ${p.dayNo} of ${p.totalDays} · ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left`;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineKind = "plan" | "handoff" | "delivery" | "review" | "decision" | "error" | "radio" | "work";
export type TimelineItem = { at: string; kind: TimelineKind; who: string | null; text: string };

/** What an event or radio line is, from its words (labels are free text written by agents and the facility). */
export function timelineKind(label: string, eventKind?: string | null): TimelineKind {
  const t = label.toLowerCase();
  if (/\b(error|failed|fail|couldn'?t|could not|crash|timed? ?out)\b/.test(t)) return "error";
  if (/^(✓|↺|→)|\breview/.test(t)) return "review";
  if (/\bdeliver|\bsubmit|\bdone:|\bfinished\b/.test(t)) return "delivery";
  if (/^for you today:|\bhand(ed)?[- ]?off|\bdelegat/.test(t) || eventKind === "delegate") return "handoff";
  if (/\bplan(ned|ning)?\b|· day \d+\/\d+/.test(t)) return "plan";
  if (eventKind === "message") return "radio";
  return "work";
}

/** Items newest day first, oldest-first inside a day; the day key is the UTC date (as the facility's days are). */
export function timelineByDay(items: TimelineItem[]) {
  const days = new Map<string, TimelineItem[]>();
  for (const it of [...items].sort((a, b) => a.at.localeCompare(b.at))) {
    const d = it.at.slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), it]);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, items: list }));
}
