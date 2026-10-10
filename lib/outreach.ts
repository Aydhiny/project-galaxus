// Pure outreach logic — no I/O, so all of it is unit-tested (outreach.test.ts).
// The services in lib/services/outreach/* do the fetching and storing.

// ─── Lead statuses ────────────────────────────────────────────────────────────

export const LEAD_STATUSES = [
  "new", "audited", "ready", "queued", "sent", "replied", "meeting", "client",
  "skipped", "not_interested", "do_not_contact",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Found",
  audited: "Audited",
  ready: "Ready",
  queued: "To send",
  sent: "Sent",
  replied: "Replied",
  meeting: "Meeting",
  client: "Client",
  skipped: "Skipped",
  not_interested: "Not interested",
  do_not_contact: "Do not contact",
};

/** Statuses that mean "they answered" — used for the reply rate. */
export const REPLIED_STATUSES: LeadStatus[] = ["replied", "meeting", "client", "not_interested", "do_not_contact"];

// ─── Phones ───────────────────────────────────────────────────────────────────

/**
 * Normalise a Places phone to E.164. Prefers the international form
 * ("+387 61 123 456"); falls back to a national Bosnian one ("061 123 456").
 */
export function normalizePhone(international?: string | null, national?: string | null): string | null {
  const intl = international?.replace(/[^\d+]/g, "");
  if (intl && /^\+\d{8,15}$/.test(intl)) return intl;
  const nat = national?.replace(/\D/g, "");
  if (nat && /^0\d{7,9}$/.test(nat)) return "+387" + nat.slice(1);
  return null;
}

/** Bosnian mobile numbers (06x) can have WhatsApp; landlines (03x etc.) usually can't. */
export function isMobileBA(e164: string | null | undefined): boolean {
  return !!e164 && /^\+3876\d{7,8}$/.test(e164);
}

/** WhatsApp click-to-chat: opens the chat with the message prefilled. You press send. */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+387(\d{2})(\d{3})(\d{3,4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

// ─── Website audit ────────────────────────────────────────────────────────────

export const GAPS = ["no_website", "social_only", "site_down", "no_booking", "not_mobile", "outdated", "no_https"] as const;
export type Gap = (typeof GAPS)[number];

export const GAP_META: Record<Gap, { label: string; weight: number }> = {
  no_website: { label: "No website", weight: 50 },
  social_only: { label: "Only Facebook/Instagram", weight: 45 },
  site_down: { label: "Website broken", weight: 40 },
  no_booking: { label: "No online booking", weight: 25 },
  not_mobile: { label: "Not mobile-friendly", weight: 20 },
  outdated: { label: "Looks outdated", weight: 10 },
  no_https: { label: "No HTTPS", weight: 10 },
};

const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linktr\.ee|tiktok\.com)$/i;

export function isSocialUrl(url: string): boolean {
  try {
    return SOCIAL_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Booking widgets and phrases (Bosnian/Croatian/Serbian + English). A
// heuristic: "Zakažite termin pozivom" (call to book) doesn't count — only
// online booking language or a known booking widget does.
const BOOKING_WIDGETS = /(calendly\.com|simplybook|setmore|doctolib|booksy|fresha|zcal|youcanbook|acuityscheduling|cal\.com|termin\.ba|zakazi\.ba)/i;
const BOOKING_PHRASES =
  /(online\s*(zakaz|zakaž|rezerv|termin|naru)|(zakaži|zakazi|zakažite|zakazite|rezervi\w*)\s+(termin\s+)?online|book\s+(now|online|an?\s+appointment)|online\s+booking|rezervacij[aue]\s+termina|zakazivanje\s+termina)/i;

export type HtmlAudit = { https: boolean; mobile: boolean; booking: boolean; outdated: boolean };

export function analyzeHtml(html: string, finalUrl: string, now = new Date()): HtmlAudit {
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  const newest = years.length ? Math.max(...years) : null;
  return {
    https: finalUrl.startsWith("https://"),
    mobile: /<meta[^>]+name=["']?viewport/i.test(html),
    booking: BOOKING_WIDGETS.test(html) || BOOKING_PHRASES.test(html),
    outdated: newest !== null && newest < now.getFullYear() - 2,
  };
}

/** Gaps from what the audit saw. `audit` is null when the site couldn't be loaded. */
export function gapsFor(website: string | null | undefined, audit: HtmlAudit | null): Gap[] {
  if (!website) return ["no_website"];
  if (isSocialUrl(website)) return ["social_only"];
  if (!audit) return ["site_down"];
  const gaps: Gap[] = [];
  if (!audit.booking) gaps.push("no_booking");
  if (!audit.mobile) gaps.push("not_mobile");
  if (audit.outdated) gaps.push("outdated");
  if (!audit.https) gaps.push("no_https");
  return gaps;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Higher = contact sooner. Gaps say how much you can help; reviews and
 * revenue are a proxy for whether they can pay; WhatsApp means one tap.
 */
export function scoreLead(l: {
  gaps: string[];
  reviewCount?: number | null;
  rating?: number | null;
  revenueKm?: number | null;
  channel?: string | null;
}): number {
  let score = 0;
  for (const g of l.gaps) score += GAP_META[g as Gap]?.weight ?? 0;
  const reviews = l.reviewCount ?? 0;
  score += reviews >= 150 ? 20 : reviews >= 50 ? 12 : reviews >= 15 ? 5 : 0;
  if ((l.rating ?? 0) >= 4.5) score += 5;
  if (l.revenueKm != null) score += l.revenueKm >= 100_000 ? 20 : l.revenueKm < 30_000 ? -15 : 0;
  if (l.channel === "whatsapp") score += 10;
  return score;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/** Wall-clock parts in a timezone. weekday: 1 = Monday … 7 = Sunday. */
export function localNow(timeZone: string, at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    }).formatToParts(at).map((p) => [p.type, p.value])
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday,
  };
}

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Random batch times inside [fromMin, toMin), at least `minGap` minutes apart.
 * Each batch gets its own equal sub-window and a random minute inside it —
 * random, but never clumped together.
 */
export function planSlots(count: number, fromMin: number, toMin: number, rand: () => number = Math.random, minGap = 45): string[] {
  const span = toMin - fromMin;
  if (count <= 0 || span <= 0) return [];
  const n = Math.max(1, Math.min(count, Math.floor(span / minGap)));
  const width = span / n;
  const usable = Math.max(1, width - minGap / 2); // keep neighbours ≥ minGap/2 + jitter apart
  return Array.from({ length: n }, (_, i) => toHHMM(Math.floor(fromMin + i * width + rand() * usable)));
}

/** 15 a day in 3 batches → [5, 5, 5]; 14 in 3 → [5, 5, 4]. */
export function batchSizes(daily: number, batches: number): number[] {
  const n = Math.max(1, batches);
  return Array.from({ length: n }, (_, i) => Math.floor(daily / n) + (i < daily % n ? 1 : 0));
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Every message ends with this — easy opt-out is the decent (and legal) thing. */
export const OPT_OUT_LINE = "Ako vas ovo ne zanima, samo odgovorite NE i neću vam se više javljati.";

type MessageLead = { name: string; category?: string | null; rating?: number | null; reviewCount?: number | null; gaps: string[] };

function isDental(category?: string | null, name?: string) {
  return /dent|stomat|zub/i.test(`${category ?? ""} ${name ?? ""}`);
}

/**
 * The no-AI message: short, specific, Bosnian, formal "Vi". Written in the
 * present tense on purpose — Bosnian past tense is gendered ("vidio/vidjela").
 */
export function templateMessage(lead: MessageLead, senderName: string): { text: string; variant: string } {
  const people = isDental(lead.category, lead.name) ? "pacijenti" : "klijenti";
  const praise =
    lead.rating && (lead.reviewCount ?? 0) >= 10
      ? `Vidim da ${lead.name} ima odlične ocjene na Google Mapama (${lead.rating.toFixed(1)}★, ${lead.reviewCount} recenzija)`
      : `Vidim ${lead.name} na Google Mapama`;
  const hello = `Dobar dan! Ja sam ${senderName}, pravim web stranice i sisteme za online zakazivanje termina za firme u BiH.`;
  const close = "Imate li 10 minuta ove sedmice za kratak razgovor?";
  const g = lead.gaps;

  let variant: string;
  let pitch: string;
  if (g.includes("no_website") || g.includes("social_only")) {
    variant = "no-website";
    pitch = `${praise}, ali nemate svoju web stranicu — ${people} koji vas traže online lako završe kod konkurencije. Mogu napraviti modernu stranicu sa online zakazivanjem, gotovu za par sedmica.`;
  } else if (g.includes("site_down")) {
    variant = "site-broken";
    pitch = `${praise}, ali vaša web stranica trenutno se ne otvara. Svaki dan bez stranice su izgubljeni ${people}. Mogu to brzo riješiti, uz online zakazivanje termina.`;
  } else if (g.includes("no_booking")) {
    variant = "no-booking";
    pitch = `${praise}, ali na vašoj stranici nema online zakazivanja. Većina ljudi danas želi zakazati termin sa mobitela, bez poziva i u bilo koje doba. Mogu dodati online rezervacije koje vam pune kalendar i smanjuju broj poziva.`;
  } else {
    variant = "modernize";
    pitch = `${praise}, ali vaša stranica se teško koristi na mobitelu i djeluje zastarjelo. Mogu je osvježiti tako da izgleda moderno i da ${people} lakše dođu do vas.`;
  }
  return { text: `${hello} ${pitch} ${close}\n\n${OPT_OUT_LINE}`, variant: `template:${variant}` };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export type StatLead = { status: string; sentAt: Date | string | null; messageVariant: string | null; gaps: string[] };

export function outreachStats(leads: StatLead[], month: string) {
  const sentThisMonth = leads.filter((l) => l.sentAt && new Date(l.sentAt).toISOString().slice(0, 7) === month);
  const replied = (l: StatLead) => (REPLIED_STATUSES as string[]).includes(l.status);
  const group = (key: (l: StatLead) => string) => {
    const out: Record<string, { sent: number; replied: number }> = {};
    for (const l of sentThisMonth) {
      const k = key(l);
      out[k] ??= { sent: 0, replied: 0 };
      out[k].sent++;
      if (replied(l)) out[k].replied++;
    }
    return out;
  };
  const sent = sentThisMonth.length;
  const replies = sentThisMonth.filter(replied).length;
  return {
    month,
    sent,
    replies,
    replyRate: sent ? Math.round((replies / sent) * 100) : 0,
    meetings: sentThisMonth.filter((l) => l.status === "meeting" || l.status === "client").length,
    clients: sentThisMonth.filter((l) => l.status === "client").length,
    byVariant: group((l) => l.messageVariant ?? "unknown"),
    byGap: group((l) => l.gaps[0] ?? "none"),
  };
}
export type OutreachStats = ReturnType<typeof outreachStats>;

// ─── Free lead sources ────────────────────────────────────────────────────────

/** OpenStreetMap business types (free, no key). Tags are OSM key=value pairs. */
export const OSM_TYPES = [
  { key: "dentist", label: "Dentists", tags: ["amenity=dentist", "healthcare=dentist"] },
  { key: "clinic", label: "Clinics & doctors", tags: ["amenity=clinic", "amenity=doctors"] },
  { key: "physio", label: "Physiotherapy", tags: ["healthcare=physiotherapist"] },
  { key: "veterinary", label: "Vets", tags: ["amenity=veterinary"] },
  { key: "hairdresser", label: "Hair salons & barbers", tags: ["shop=hairdresser"] },
  { key: "beauty", label: "Beauty salons", tags: ["shop=beauty"] },
  { key: "gym", label: "Gyms", tags: ["leisure=fitness_centre"] },
  { key: "restaurant", label: "Restaurants", tags: ["amenity=restaurant"] },
  { key: "cafe", label: "Cafés", tags: ["amenity=cafe"] },
  { key: "hotel", label: "Hotels & apartments", tags: ["tourism=hotel", "tourism=guest_house", "tourism=apartment"] },
  { key: "car_repair", label: "Car repair", tags: ["shop=car_repair"] },
  { key: "lawyer", label: "Lawyers", tags: ["office=lawyer"] },
  { key: "accountant", label: "Accountants", tags: ["office=accountant"] },
  { key: "estate_agent", label: "Real estate agents", tags: ["office=estate_agent"] },
] as const;
export type OsmTypeKey = (typeof OSM_TYPES)[number]["key"];
export const osmType = (key: string) => OSM_TYPES.find((t) => t.key === key) ?? null;

/**
 * Best phone number on a web page: tel: links first (they're deliberate),
 * then anything that looks like a Bosnian number. Mobiles win (WhatsApp).
 */
export function extractPhone(html: string): string | null {
  const found: string[] = [];
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const raw = decodeURIComponent(m[1]).replace(/[^\d+]/g, "");
    const p = raw.startsWith("+") ? normalizePhone(raw, null) : normalizePhone(null, raw.replace(/^00387/, "0").replace(/^387/, "0"));
    if (p) found.push(p);
  }
  if (found.length === 0) {
    const text = html.replace(/<[^>]+>/g, " ");
    for (const m of text.matchAll(/(?:\+387|00387|\b0)[\s/.-]?(\d{2})[\s/.-]?(\d{3})[\s/.-]?(\d{3,4})\b/g)) {
      const p = normalizePhone(null, `0${m[1]}${m[2]}${m[3]}`);
      if (p) found.push(p);
    }
  }
  return found.find(isMobileBA) ?? found[0] ?? null;
}

export type PastedLead = { name: string; phone: string | null; website: string | null };

/**
 * One business per line, in any order: "Dental Smile, 061 123 456, smile.ba".
 * Pulls out the phone and the website; whatever's left is the name.
 */
export function parsePastedLeads(text: string): PastedLead[] {
  const out: PastedLead[] = [];
  for (const line of text.split(/\r?\n/)) {
    let rest = line.trim();
    if (!rest) continue;
    const url = rest.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ba|com|net|org|info|hr|rs|me|eu|site|online)(?:\/\S*)?)/i);
    let website: string | null = null;
    if (url) {
      website = url[1].startsWith("http") ? url[1] : `https://${url[1]}`;
      rest = rest.replace(url[0], " ");
    }
    const phoneMatch = rest.match(/(\+?\d[\d\s/().-]{6,}\d)/);
    let phone: string | null = null;
    if (phoneMatch) {
      const digits = phoneMatch[1].replace(/[^\d+]/g, "");
      phone = digits.startsWith("+") ? normalizePhone(digits, null) : normalizePhone(null, digits.replace(/^00387/, "0").replace(/^387/, "0"));
      rest = rest.replace(phoneMatch[0], " ");
    }
    const name = rest.replace(/[|,;\t·–-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 255);
    if (name) out.push({ name, phone, website });
  }
  return out;
}
