// Loads a lead's homepage and turns what it finds into gaps (lib/outreach.ts).

import { analyzeHtml, gapsFor, isSocialUrl, type Gap } from "@/lib/outreach";

const MAX_BYTES = 1_500_000;
const UA = "Mozilla/5.0 (compatible; GalaxusSiteCheck/1.0; one-off homepage check)";

/** Only public http(s) hosts — never localhost/private IPs (SSRF guard). */
function isFetchable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname;
    return !(
      h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.includes(":") || h === "[::1]"
    );
  } catch {
    return false;
  }
}

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

export async function auditWebsite(website: string | null): Promise<Gap[]> {
  if (!website || isSocialUrl(website)) return gapsFor(website, null);
  if (!isFetchable(website)) return ["site_down"];
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(9_000),
      cache: "no-store",
    });
    if (!res.ok) return gapsFor(website, null);
    const html = await readCapped(res);
    if (html.length < 200) return gapsFor(website, null); // parked/empty page
    return gapsFor(website, analyzeHtml(html, res.url || website));
  } catch {
    return gapsFor(website, null);
  }
}
