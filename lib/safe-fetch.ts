// One SSRF guard for every server-side fetch of a URL that a user, an agent or
// a web page chose (lead websites, Reach, link previews, calendar feeds, free
// LLM base URLs…). Without it, "read this page" could be pointed at
// http://169.254.169.254/, http://127.0.0.1:9001/ or a 10.x service inside
// the host's network, and the response would come straight back to the caller.
//
// What it enforces, on EVERY hop (redirects are followed by hand, not by fetch):
//   • http(s) only, no user:password@ in the URL
//   • no internal host names (localhost, *.local, *.internal, single-label names…)
//   • the host must resolve ONLY to public addresses: loopback, private,
//     link-local, CGNAT, multicast, documentation and IPv6 ULA / link-local /
//     IPv4-mapped / NAT64 / 6to4 forms of those are all refused
//   • at most `maxRedirects` redirects, one overall timeout, and the
//     Authorization / Cookie headers are dropped when a redirect changes origin
//
// Known limit (documented in SECURITY_REVIEW.md): the DNS answer we check and
// the one fetch() uses are two lookups, so a DNS-rebinding attacker with a
// very short TTL could still race it. Closing that needs a pinned-IP
// dispatcher (undici Agent with a custom `connect.lookup`).

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BlockedUrlError extends Error {
  constructor(message = "That address isn't on the public internet.") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export type LookupFn = (host: string) => Promise<{ address: string; family: number }[]>;

const realLookup: LookupFn = (host) => dnsLookup(host, { all: true, verbatim: true });
let lookupImpl: LookupFn = realLookup;

/** Tests have no network: vitest.setup.ts swaps in a resolver. Pass null to restore real DNS. */
export function setSafeFetchLookup(fn: LookupFn | null) {
  lookupImpl = fn ?? realLookup;
}

// ─── Address classification ───────────────────────────────────────────────────

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [network, prefix length] — everything that is not ordinary public unicast.
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"; 0.0.0.0 reaches localhost on Linux
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + 255.255.255.255 broadcast
];
const V4_RANGES = V4_BLOCKED.map(([net, bits]) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { net: (v4ToInt(net)! & mask) >>> 0, mask };
});

export function isPrivateIPv4(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return true; // not a clean dotted quad: refuse rather than guess
  return V4_RANGES.some((r) => ((n & r.mask) >>> 0) === r.net);
}

/** "::ffff:1.2.3.4", "fe80::1%eth0", "2001:db8::" → eight 16-bit groups (null if malformed). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // A trailing dotted IPv4 becomes two hex groups.
  const dotted = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const n = v4ToInt(dotted[2]);
    if (n === null) return null;
    s = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

const v4From = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;

export function isPrivateIPv6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return true;
  const [a, b] = g;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 8)) return true; // ::
  if (zeros(0, 7) && g[7] === 1) return true; // ::1
  if (zeros(0, 5) && g[5] === 0xffff) return isPrivateIPv4(v4From(g[6], g[7])); // ::ffff:a.b.c.d (IPv4-mapped)
  if (zeros(0, 6)) return true; // ::a.b.c.d (deprecated IPv4-compatible) — never legitimate on the internet
  if (a === 0x64 && b === 0xff9b && zeros(2, 6)) return isPrivateIPv4(v4From(g[6], g[7])); // NAT64 64:ff9b::/96
  if (a === 0x64 && b === 0xff9b && g[2] === 1) return true; // local-use NAT64 64:ff9b:1::/48
  if (a === 0x2002) return isPrivateIPv4(v4From(b, g[2])); // 6to4 embeds an IPv4 address
  if (a === 0x2001 && b === 0) return true; // Teredo (embeds an obfuscated IPv4)
  if (a === 0x2001 && b === 0xdb8) return true; // documentation
  if (a === 0x100 && zeros(1, 4)) return true; // discard-only 100::/64
  if ((a & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((a & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((a & 0xffc0) === 0xfec0) return true; // old site-local fec0::/10
  if ((a & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** True for any address a server-side fetch must never reach. Unknown formats count as private. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const fam = isIP(bare.split("%")[0]);
  if (fam === 4) return isPrivateIPv4(bare);
  if (fam === 6) return isPrivateIPv6(bare);
  return true;
}

// ─── URL policy ───────────────────────────────────────────────────────────────

const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa", ".intranet", ".corp", ".localdomain"];

function isInternalHostname(host: string): boolean {
  if (host === "localhost" || host === "metadata" || host === "metadata.google.internal") return true;
  if (INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return !host.includes("."); // single-label names resolve through search domains (internal by nature)
}

/**
 * Synchronous checks on a URL (no DNS): scheme, credentials, internal names
 * and IP literals. The WHATWG parser normalises decimal / hex / octal / short
 * IPv4 forms first, so "http://2130706433/" and "http://0x7f.1/" are seen as
 * 127.0.0.1. Throws BlockedUrlError; returns the parsed URL.
 */
export function checkUrl(raw: string | URL, opts: { httpsOnly?: boolean } = {}): URL {
  let u: URL;
  try {
    u = new URL(String(raw));
  } catch {
    throw new BlockedUrlError("That isn't a valid web address.");
  }
  if (u.protocol !== "https:" && (opts.httpsOnly || u.protocol !== "http:")) {
    throw new BlockedUrlError(opts.httpsOnly ? "Only https:// addresses are allowed." : "Only http(s) addresses are allowed.");
  }
  if (u.username || u.password) throw new BlockedUrlError("Addresses with a user name or password in them aren't allowed.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal.split("%")[0])) {
    if (isPrivateAddress(literal)) throw new BlockedUrlError();
    return u;
  }
  if (!host || isInternalHostname(host)) throw new BlockedUrlError();
  return u;
}

/** checkUrl() as a boolean (for "skip it" call sites). */
export function isPublicUrl(raw: string | URL, opts: { httpsOnly?: boolean } = {}): boolean {
  try {
    checkUrl(raw, opts);
    return true;
  } catch {
    return false;
  }
}

/** checkUrl() plus DNS: every address the host resolves to must be public. */
export async function assertPublicUrl(raw: string | URL, opts: { httpsOnly?: boolean; lookup?: LookupFn } = {}): Promise<URL> {
  const u = checkUrl(raw, opts);
  const literal = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal.split("%")[0])) return u;
  let addrs: { address: string }[];
  try {
    addrs = await (opts.lookup ?? lookupImpl)(u.hostname);
  } catch {
    throw new BlockedUrlError(`Couldn't find ${u.hostname}.`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new BlockedUrlError();
  return u;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export type SafeFetchOptions = {
  /** Whole request, all hops included. Default 15 s. */
  timeoutMs?: number;
  /** Default 5. 0 = refuse any redirect. */
  maxRedirects?: number;
  httpsOnly?: boolean;
  /** Test seams. */
  lookup?: LookupFn;
  fetchImpl?: typeof fetch;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

/**
 * fetch() for URLs we don't control. Same signature as fetch (string/URL
 * input), but every hop is checked with assertPublicUrl() first. Throws
 * BlockedUrlError for a refused address or too many redirects.
 */
export async function safeFetch(input: string | URL, init: RequestInit = {}, opts: SafeFetchOptions = {}): Promise<Response> {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const maxRedirects = opts.maxRedirects ?? 5;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const headers = new Headers(init.headers);
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let url = await assertPublicUrl(input, opts);

  for (let hop = 0; ; hop++) {
    const res = await doFetch(url.toString(), { ...init, method, body, headers: new Headers(headers), signal, redirect: "manual" });
    const location = res.headers.get("location");
    if (!REDIRECTS.has(res.status) || !location) return res;
    res.body?.cancel().catch(() => {});
    if (hop >= maxRedirects) throw new BlockedUrlError("Too many redirects.");
    const next = await assertPublicUrl(new URL(location, url), opts);
    // Same rules browsers follow: 303 (and 301/302 after a POST) become a GET without a body.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
    }
    // Never carry credentials to a different origin.
    if (next.origin !== url.origin) for (const h of CREDENTIAL_HEADERS) headers.delete(h);
    url = next;
  }
}

/** Read at most `maxBytes` of a body as text, then stop (a hostile server can't stream forever). */
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    chunks.push(value.length > room ? value.subarray(0, room) : value);
    total += Math.min(value.length, room);
  }
  reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}
