// Business finder: "dentists in Sarajevo, with phone / WhatsApp / email and how
// bad their website is". Two layers:
//   1. The list — map data, not web search: OpenStreetMap (free, always), plus
//      Foursquare and Google Places when you've saved those keys in Outreach.
//   2. The gaps — Agent Reach's method (lib/services/reach.ts): read each
//      business's website (phone, email, quality via the Outreach audit); with no
//      website, search the web for its page (Facebook, directories) and read the
//      phone/email there.
// Nothing is invented: an unknown cell stays empty, and every row keeps its source link.

import { getSecret } from "@/lib/services/secrets";
import { GAP_META, bizKey, extractEmail, extractPhone, isMobileBA, isSocialUrl, osmType, type Gap } from "@/lib/outreach";
import type { Place } from "@/lib/services/outreach/places";
import { rankBusinessRows } from "@/lib/ops-learning";

export type BusinessRow = {
  name: string; category: string; address: string; phone: string; whatsapp: "yes" | "no" | "";
  email: string; website: string; websiteStatus: string; source: string;
};
export const BUSINESS_COLUMNS = ["Name", "Category", "Address", "Phone", "WhatsApp", "Email", "Website", "Website status", "Source"];
export const businessRowCells = (r: BusinessRow) => [r.name, r.category, r.address, r.phone, r.whatsapp, r.email, r.website, r.websiteStatus, r.source];

/** Places from every source you have, merged by business name. */
async function placesFor(userId: number, typeKey: string, city: string) {
  const type = osmType(typeKey)!;
  const [fsqKey, googleKey] = await Promise.all([getSecret(userId, "foursquare"), getSecret(userId, "google")]);
  const { searchOsm } = await import("@/lib/services/outreach/osm");
  const jobs: Promise<Place[]>[] = [searchOsm(typeKey, city)];
  if (fsqKey) jobs.push(import("@/lib/services/outreach/foursquare").then((m) => m.searchFoursquare(fsqKey, type.label.split(/[&,]/)[0].trim(), city)));
  // Google Places bills past its free tier: every call goes through Outreach's monthly cap (it throws when the cap is reached).
  if (googleKey) jobs.push((async () => {
    const { takePlacesCall } = await import("@/lib/services/outreach/engine");
    await takePlacesCall(userId);
    const { searchPlaces } = await import("@/lib/services/outreach/places");
    return (await searchPlaces(googleKey, `${type.label} ${city}`)).places;
  })());
  const settled = await Promise.allSettled(jobs);
  const sources = ["OpenStreetMap", "Foursquare", "Google Places"].slice(0, jobs.length);
  const used = sources.filter((_, i) => settled[i].status === "fulfilled");
  if (!used.length) throw new Error(settled[0].status === "rejected" ? String((settled[0].reason as Error)?.message ?? "Map search failed") : "Map search failed");
  const byKey = new Map<string, Place>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const p of s.value) {
      const k = bizKey(p.name);
      const prev = byKey.get(k);
      byKey.set(k, prev ? { ...prev, internationalPhone: prev.internationalPhone ?? p.internationalPhone, website: prev.website ?? p.website, address: prev.address ?? p.address, mapsUrl: prev.mapsUrl ?? p.mapsUrl } : p);
    }
  }
  return { places: [...byKey.values()], used };
}

const statusOf = (gaps: Gap[]) => gaps.length ? gaps.map((g) => GAP_META[g].label).join(", ") : "Good";

/** Fill one business's gaps from the web (its site, or its page found by search). Never throws. */
async function enrich(p: Place, category: string, city: string): Promise<BusinessRow> {
  let phone = p.internationalPhone ?? p.nationalPhone ?? "";
  let email = "";
  let website = p.website ?? "";
  let status = "";
  try {
    if (website && !isSocialUrl(website)) {
      const { auditWebsite } = await import("@/lib/services/outreach/audit");
      const a = await auditWebsite(website);
      status = statusOf(a.gaps);
      phone ||= a.phone ?? "";
      email = a.email ?? "";
    } else {
      status = website ? GAP_META.social_only.label : GAP_META.no_website.label;
      // No website: find its page on the web (Facebook, a directory) the Agent Reach way, and read contacts off it.
      const { reachRead, reachSearch } = await import("@/lib/services/reach");
      const hit = website ? { url: website } : (await reachSearch(`${p.name} ${city} kontakt telefon`, 3).catch(() => ({ results: [] as { url: string }[] }))).results[0];
      if (hit) {
        const page = await reachRead(hit.url, 8000).catch(() => null);
        if (page) {
          phone ||= extractPhone(page.text) ?? "";
          email = extractEmail(page.text) ?? "";
          if (!website && isSocialUrl(hit.url)) { website = hit.url; status = GAP_META.social_only.label; }
        }
      }
    }
  } catch { /* keep what the map gave us */ }
  return {
    name: p.name, category, address: p.address ?? city, phone, whatsapp: phone ? (isMobileBA(phone) ? "yes" : "no") : "",
    email, website, websiteStatus: status, source: p.mapsUrl ?? "",
  };
}

/** Run `fn` over items with at most `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/**
 * Find businesses of a type in a city and fill their contacts and website status.
 * Businesses that most need a website come first (none / Facebook only / broken / outdated),
 * nudged by your learned preferences (lib/ops-learning.ts rankBusinessRows).
 */
export async function findBusinessesFor(userId: number, typeKey: string, city: string, o: { limit?: number; deadlineMs?: number } = {}) {
  const type = osmType(typeKey);
  if (!type) throw new Error(`Unknown business type "${typeKey}".`);
  const { places, used } = await placesFor(userId, typeKey, city.trim() || "Sarajevo");
  const limit = Math.max(1, Math.min(o.limit ?? 60, 120));
  const deadline = Date.now() + (o.deadlineMs ?? 150_000);
  const picked = places.slice(0, limit);
  // Each lookup stops being started once we're near the deadline (rows stay as the map gave them).
  const rows = await pool(picked, 6, (p) => Date.now() < deadline ? enrich(p, type.label, city) : Promise.resolve<BusinessRow>({
    name: p.name, category: type.label, address: p.address ?? city, phone: p.internationalPhone ?? "", whatsapp: p.internationalPhone ? (isMobileBA(p.internationalPhone) ? "yes" : "no") : "",
    email: "", website: p.website ?? "", websiteStatus: "", source: p.mapsUrl ?? "",
  }));
  // Need first, adjusted by what you've taught it (skipped / moved forward leads, accepted / sent-back sheets).
  const { preferencesFor } = await import("@/lib/services/ops-learning");
  const prefs = await preferencesFor(userId).catch(() => []);
  return { rows: rankBusinessRows(rows, prefs), found: places.length, sources: used };
}

/** Rows → one markdown table (what missions deliver and the merged sheet reads). */
export function businessTable(rows: BusinessRow[]) {
  const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  return [`| ${BUSINESS_COLUMNS.join(" | ")} |`, `|${BUSINESS_COLUMNS.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${businessRowCells(r).map(cell).join(" | ")} |`)].join("\n");
}

/** "FIND: dentist @ Sarajevo" in a mission brief → the finder's input (the planner writes this line). */
export function parseFindLine(brief: string | null | undefined) {
  const m = String(brief ?? "").match(/^FIND:\s*([a-z_]+)\s*@\s*([^\n]{2,60})$/im);
  return m && osmType(m[1].toLowerCase()) ? { type: m[1].toLowerCase(), city: m[2].trim() } : null;
}
