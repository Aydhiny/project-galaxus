// Opportunity watcher — pure parsing and scoring (tested without the network).
// Sources: Devpost hackathons (public JSON), itch.io game jams (public page),
// EU Funding & Tenders portal (public search API) and BiH ministries' RSS
// feeds for javni pozivi (public calls). All free, no keys.

export type OppKind = "hackathon" | "jam" | "grant";
export type OppSource = "devpost" | "itch" | "eu" | "bih";

export type Opp = {
  source: OppSource;
  extId: string;
  kind: OppKind;
  title: string;
  summary: string | null;
  url: string;
  image: string | null;
  deadline: Date | null; // submission / application deadline (jams: when it starts)
  prize: string | null;
  location: string | null;
  tags: string[];
};

export const OPP_KINDS: { key: OppKind; label: string; emoji: string }[] = [
  { key: "hackathon", label: "Hackathons", emoji: "💻" },
  { key: "jam", label: "Game jams", emoji: "🎮" },
  { key: "grant", label: "Grants", emoji: "🏛️" },
];

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&#8211;/g, "–").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Devpost's "Sep 15 - Nov 02, 2026" / "Oct 01 - 05, 2026" / "Oct 11, 2026" → end of the last day (UTC). */
export function devpostEnd(range: string): Date | null {
  const parts = range.split(/\s+-\s+/);
  const last = parts[parts.length - 1].trim();
  const year = Number(last.match(/(\d{4})$/)?.[1]);
  if (!year) return null;
  let m = last.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})/);
  let month: number | undefined, day: number;
  if (m) { month = MONTHS[m[1].toLowerCase()]; day = Number(m[2]); }
  else {
    day = Number(last.match(/^(\d{1,2})/)?.[1]);
    m = parts[0].match(/^([A-Za-z]{3})/);
    month = m ? MONTHS[m[1].toLowerCase()] : undefined;
  }
  if (month === undefined || !day) return null;
  return new Date(Date.UTC(year, month, day, 23, 59));
}

type DevpostHackathon = {
  id: number; title: string; url: string; thumbnail_url?: string; open_state?: string; invite_only?: boolean;
  submission_period_dates?: string; displayed_location?: { location?: string }; prize_amount?: string;
  themes?: { name: string }[]; organization_name?: string; registrations_count?: number;
};

export function parseDevpost(json: unknown): Opp[] {
  const list = (json as { hackathons?: DevpostHackathon[] })?.hackathons ?? [];
  return list.filter((h) => !h.invite_only).map((h) => {
    const location = h.displayed_location?.location ?? null;
    const prize = h.prize_amount ? strip(h.prize_amount) : null;
    return {
      source: "devpost" as const, extId: String(h.id), kind: "hackathon" as const, title: h.title.slice(0, 300),
      summary: [h.organization_name, h.registrations_count ? `${h.registrations_count} registered` : null].filter(Boolean).join(" · ") || null,
      url: h.url, image: h.thumbnail_url ? (h.thumbnail_url.startsWith("//") ? `https:${h.thumbnail_url}` : h.thumbnail_url) : null,
      deadline: h.submission_period_dates ? devpostEnd(h.submission_period_dates) : null,
      prize: prize && prize !== "$0" ? prize : null, location, tags: (h.themes ?? []).map((t) => t.name).slice(0, 6),
    };
  });
}

/** itch.io's upcoming-jams page (server-rendered cards). */
export function parseItchJams(html: string): Opp[] {
  const out: Opp[] = [];
  for (const block of html.split(/class="padded_content"/).slice(1)) {
    const link = block.match(/<h3[^>]*><a href="(\/jam\/[^"]+)">([^<]+)<\/a>/);
    if (!link) continue;
    const start = block.match(/class="date_countdown">([^<]+)</)?.[1];
    const lasts = block.match(/class="date_duration">([^<]+)</)?.[1] ?? null;
    const joined = block.match(/<span class="number">([\d,]+)<\/span> joined/)?.[1] ?? null;
    const host = block.match(/Hosted by <a[^>]*>([^<]+)<\/a>/)?.[1] ?? null;
    out.push({
      source: "itch", extId: link[1].replace("/jam/", ""), kind: "jam", title: strip(link[2]).slice(0, 300),
      summary: [host && `Hosted by ${strip(host)}`, lasts && `lasts ${lasts}`, joined && `${joined} joined`].filter(Boolean).join(" · ") || null,
      url: `https://itch.io${link[1]}`, image: block.match(/data-background_image="([^"]+)"/)?.[1] ?? null,
      deadline: start && !Number.isNaN(Date.parse(start)) ? new Date(start) : null, prize: null, location: "Online", tags: ["game jam"],
    });
  }
  return out;
}

type EuResult = { url: string; summary?: string; metadata?: Record<string, string[] | undefined> };

/** EU Funding & Tenders search results → open calls with a future deadline. */
export function parseEu(json: unknown, now = new Date()): Opp[] {
  const results = (json as { results?: EuResult[] })?.results ?? [];
  const out: Opp[] = [];
  for (const r of results) {
    const m = r.metadata ?? {};
    const id = m.identifier?.[0];
    const deadlines = (m.deadlineDate ?? []).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()) && d > now).sort((a, b) => +a - +b);
    if (!id || deadlines.length === 0) continue;
    out.push({
      source: "eu", extId: id.slice(0, 200), kind: "grant", title: strip(m.title?.[0] ?? r.summary ?? id).slice(0, 300),
      summary: m.callTitle?.[0] ? strip(m.callTitle[0]).slice(0, 400) : null,
      url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(id)}`,
      image: null, deadline: deadlines[0], prize: null, location: "EU", tags: (m.keywords ?? []).slice(0, 6).map((k) => strip(k)),
    });
  }
  return out;
}

const BIH_CALL = /javni poziv|poticaj|grant|subvencij|podršk|podrsk|sufinans|program.*(mlad|poduzet|obrt|inovac|start)|mlad.*poduzet|startup|start-up|inovac/i;
const BIH_SKIP = /nabavk|odluka o izboru|ponuđač|tender|rezultat|lista korisnika|konačn|zapisnik|obavještenje o ishodu/i;

/** "rok ... do 15.11.2026" → that date (end of day). */
export function bihDeadline(text: string): Date | null {
  const m = text.match(/(?:rok|do|zaključno sa|zakljucno sa|najkasnije)[^0-9]{0,40}(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/i);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 22, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseBihRss(xml: string, sourceName: string): Opp[] {
  const out: Opp[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = strip(item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "");
    const link = strip(item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1] ?? "");
    const desc = strip(item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? "");
    const body = strip(item.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/)?.[1] ?? "");
    if (!title || !link || BIH_SKIP.test(title) || !BIH_CALL.test(`${title} ${desc}`)) continue;
    out.push({
      source: "bih", extId: link.slice(0, 200), kind: "grant", title: title.slice(0, 300), summary: desc.slice(0, 400) || null,
      url: link, image: null, deadline: bihDeadline(`${desc} ${body}`), prize: null, location: sourceName, tags: ["BiH"],
    });
  }
  return out;
}

// What counts as "your kind of thing": AI, code, games, video, music, young founders.
const INTEREST: [RegExp, number][] = [
  [/\b(ai|artificial intelligence|machine learning|llm|gpt|agent)/i, 18],
  [/\bgame|gaming|unity|godot|unreal|jam\b|igr[aei]/i, 18],
  [/\b(web|software|app|developer|coding|code|open source|digital|digitaln|it\b|tech)/i, 12],
  [/\b(video|film|music|audio|creative|kreativ|content|media)/i, 10],
  [/\b(young|youth|student|mlad|start-?up|founder|entrepreneur|poduzet|preduzet|sme|innovation|inovac)/i, 16],
  [/\b(open ended|beginner|any)/i, 4],
];

/** 0–100: how worth your time this is (interest + reachable + deadline sweet spot + prize). */
export function oppScore(o: Opp, now = new Date()): number {
  const text = `${o.title} ${o.summary ?? ""} ${o.tags.join(" ")}`;
  let s = o.kind === "grant" ? 20 : 25;
  for (const [re, w] of INTEREST) if (re.test(text)) s += w;
  if (o.kind === "hackathon") s += /online/i.test(o.location ?? "") ? 12 : -15; // in-person abroad is rarely doable
  if (o.source === "bih") s += 15; // local calls are the most winnable
  if (o.prize) {
    const amount = Number(o.prize.replace(/[^\d]/g, ""));
    s += amount >= 50_000 ? 10 : amount >= 5_000 ? 6 : amount > 0 ? 3 : 0;
  }
  if (o.deadline) {
    const days = (o.deadline.getTime() - now.getTime()) / 86_400_000;
    if (days < 0) return 0;
    s += days < 2 ? -20 : days <= 45 ? 8 : days > 120 ? -5 : 0;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Score threshold above which a deadline is put straight into your tasks. */
export const AUTO_TASK_SCORE = 75;
