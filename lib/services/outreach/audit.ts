// Loads a lead's homepage and turns what it finds into gaps (lib/outreach.ts).

import { analyzeHtml, bizKey, extractEmail, extractPhone, gapsFor, isSocialUrl, type Gap } from "@/lib/outreach";
import { isPublicUrl, safeFetch } from "@/lib/safe-fetch";

const MAX_BYTES = 1_500_000;
const UA = "Mozilla/5.0 (compatible; GalaxusSiteCheck/1.0; one-off homepage check)";

/**
 * Only public http(s) hosts — never localhost/private IPs (SSRF guard). This
 * is the quick syntax check; safeFetch() below also checks what the name
 * resolves to and every redirect (the old guard let a redirect or a DNS name
 * pointing at 127.0.0.1 straight through).
 */
const isFetchable = (url: string) => isPublicUrl(url);

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/** Gaps on the homepage, plus a phone number found there (for leads without one). */
export async function auditWebsite(website: string | null): Promise<{ gaps: Gap[]; phone: string | null; email?: string | null }> {
  if (!website || isSocialUrl(website)) return { gaps: gapsFor(website, null), phone: null };
  if (!isFetchable(website)) return { gaps: ["site_down"], phone: null };
  try {
    const res = await safeFetch(website, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" }, { timeoutMs: 9_000 });
    if (!res.ok) return { gaps: gapsFor(website, null), phone: null };
    const html = await readCapped(res);
    if (html.length < 200) return { gaps: gapsFor(website, null), phone: null }; // parked/empty page
    // No number on the homepage? Most Bosnian sites put it on /kontakt.
    const phone = extractPhone(html) ?? (await contactPagePhone(res.url || website));
    return { gaps: gapsFor(website, analyzeHtml(html, res.url || website)), phone, email: extractEmail(html) };
  } catch {
    return { gaps: gapsFor(website, null), phone: null };
  }
}

async function getHtml(url: string, timeoutMs = 7_000): Promise<{ html: string; url: string } | null> {
  if (!isFetchable(url)) return null;
  try {
    const res = await safeFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" }, { timeoutMs });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return { html: await readCapped(res), url: res.url || url };
  } catch {
    return null;
  }
}

async function contactPagePhone(base: string): Promise<string | null> {
  for (const path of ["/kontakt", "/contact", "/kontakt/", "/contact-us"]) {
    const page = await getHtml(new URL(path, base).toString(), 6_000);
    const phone = page ? extractPhone(page.html) : null;
    if (phone) return phone;
  }
  return null;
}

// Words that describe the kind of business, not its name — dropped when guessing a domain.
const GENERIC = new Set(("stomatoloska ordinacija ordinacija stomatologija dental centar center klinika poliklinika salon frizerski frizer "
  + "kozmeticki beauty studio restoran restaurant caffe cafe kafic bar pizzeria hotel apartmani apartments hostel auto servis "
  + "autoservis praonica advokat advokatska kancelarija agencija nekretnine fitness gym teretana pekara cvjecara optika apoteka "
  + "the and i d o o doo sp obrt szr pzu zu").split(" "));

/** example: "Smile Design" → smiledesign.ba, smile-design.ba, smiledesign.com … */
export function domainCandidates(name: string): string[] {
  const words = bizKey(name).split(" ").filter(Boolean);
  const core = words.filter((w) => !GENERIC.has(w));
  const sets = [core, words].filter((w, i, a) => w.length > 0 && w.length <= 4 && (i === 0 || w.join() !== a[0].join()));
  const out: string[] = [];
  for (const w of sets) {
    for (const joined of [w.join(""), w.join("-")]) {
      if (joined.length < 4) continue;
      for (const tld of [".ba", ".com", ".com.ba"]) out.push(`${joined}${tld}`);
    }
  }
  return [...new Set(out)].slice(0, 8);
}

/**
 * A lead without a website on the map often still has one. Try the obvious
 * domains and accept one only if the page itself names the business — so a
 * lead is never pitched "you have no website" by mistake.
 */
export async function findWebsite(name: string, city: string | null): Promise<string | null> {
  const distinctive = bizKey(name).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));
  if (distinctive.length === 0) return null;
  const results = await Promise.all(domainCandidates(name).map(async (d) => {
    const page = (await getHtml(`https://${d}`, 6_000)) ?? (await getHtml(`http://${d}`, 5_000));
    if (!page || page.html.length < 500) return null;
    const head = bizKey(page.html.slice(0, 200_000).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
    const hits = distinctive.filter((w) => head.includes(w)).length;
    const parked = /domain (is )?for sale|parked|buy this domain|ova domena je na prodaju|coming soon/i.test(page.html.slice(0, 20_000));
    const cityHit = city ? head.includes(bizKey(city)) : false;
    return !parked && hits === distinctive.length && (hits >= 2 || cityHit || head.includes(distinctive.join(" "))) ? page.url : null;
  }));
  return results.find(Boolean) ?? null;
}
