// Reach: Galaxus's eyes on the internet, built on Agent Reach's design
// (github.com/Panniantong/agent-reach): every channel is an ordered list of
// backends — first one that works wins, broken ones are skipped — and a
// "doctor" probes each channel so you can see what's working.
//
// Server-side, keyless backends only (Galaxus runs on Vercel, no Python CLIs):
//   web     → direct fetch ▸ Jina Reader (r.jina.ai) ▸ Exa fetch
//   search  → Exa (free MCP endpoint, mcp.exa.ai)
//   reddit  → your Reddit app (if set) ▸ RSS www.reddit.com ▸ RSS old.reddit.com
//   youtube → YouTube Data API (your key) ▸ Exa search scoped to youtube.com
//   rss     → direct
// YouTube transcripts and logged-in sites need the real Agent Reach on your
// computer (yt-dlp / OpenCLI); the connect wizard sets that up for local agents.

import { checkUrl, readTextCapped, safeFetch } from "@/lib/safe-fetch";

const UA = "Mozilla/5.0 (compatible; GalaxusReach/1.0; +https://project-galaxus.vercel.app)";
// Reddit asks for a descriptive User-Agent; generic ones are throttled first.
const REDDIT_UA = "web:galaxus:1.0 (personal research tool; read-only)";
const EXA_MCP = "https://mcp.exa.ai/mcp";

export class ReachError extends Error {
  constructor(public channel: string, public tried: string[]) { super(`${channel}: every route failed (${tried.join("; ")})`); }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ─── Low-level backends ───────────────────────────────────────────────────────

// The URL can come from an agent or a web page, so it goes through the SSRF
// guard (public addresses only, every redirect re-checked) and the body is capped.
const MAX_DIRECT_BYTES = 4_000_000;

async function direct(url: string, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", ua = UA, timeoutMs = 15_000) {
  const res = await safeFetch(url, { headers: { "User-Agent": ua, Accept: accept }, cache: "no-store" }, { timeoutMs });
  if (!res.ok) { res.body?.cancel().catch(() => {}); throw new Error(`HTTP ${res.status}`); }
  return readTextCapped(res, MAX_DIRECT_BYTES);
}

async function jina(url: string) {
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain", "X-No-Cache": "true" }, signal: AbortSignal.timeout(25_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (/Warning: Target URL returned error (4\d\d|5\d\d)/.test(text) && text.length < 2000) throw new Error("blocked");
  return text;
}

/** One call to Exa's free MCP server (stateless JSON-RPC over HTTP, SSE-framed reply). */
async function exa(tool: "web_search_exa" | "web_fetch_exa", args: Record<string, unknown>) {
  const res = await fetch(EXA_MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
    signal: AbortSignal.timeout(30_000), cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  const json = raw.includes("data:") ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("") : raw;
  const msg = JSON.parse(json) as { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message?: string } };
  if (msg.error || msg.result?.isError) throw new Error(msg.error?.message ?? msg.result?.content?.[0]?.text?.slice(0, 120) ?? "error");
  return (msg.result?.content ?? []).map((c) => c.text ?? "").join("\n");
}

/** Exa's text block → results ("Title: … URL: … Published: … Highlights: …"). */
export function parseExa(text: string) {
  return text.split(/\n(?=Title: )/).map((block) => {
    const get = (k: string) => block.match(new RegExp(`^${k}: (.*)$`, "m"))?.[1]?.trim() ?? null;
    const title = get("Title"), url = get("URL");
    if (!title || !url) return null;
    const body = block.split(/\nHighlights:\n|\nText:\n/)[1] ?? "";
    return { title, url, published: get("Published"), snippet: clip(body.replace(/\s+/g, " ").trim(), 700) };
  }).filter((r): r is NonNullable<typeof r> => !!r);
}

/** HTML → readable text (good enough for agents and audits). */
export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

// ─── Health: remember which route worked (per server instance) ────────────────

type Health = { ok: boolean; route: string; at: number; error?: string };
const health = new Map<string, Health>();
function mark(channel: string, ok: boolean, route: string, error?: string) { health.set(channel, { ok, route, at: Date.now(), error }); }

async function chain<T>(channel: string, routes: [string, () => Promise<T>][]): Promise<{ value: T; route: string }> {
  const tried: string[] = [];
  for (const [name, fn] of routes) {
    try {
      const value = await fn();
      mark(channel, true, name);
      return { value, route: name };
    } catch (e) {
      tried.push(`${name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  mark(channel, false, "none", tried.join("; "));
  throw new ReachError(channel, tried);
}

// ─── Channels ─────────────────────────────────────────────────────────────────

/** Read any page as text/markdown. */
export async function reachRead(url: string, maxChars = 12_000) {
  // Public http(s) pages only: no localhost, private/metadata IPs or internal names (see lib/safe-fetch.ts).
  const u = checkUrl(url);
  const r = await chain("web", [
    ["direct", async () => { const t = htmlToText(await direct(u.toString())); if (t.length < 200) throw new Error("too little text (JS page?)"); return t; }],
    ["jina", () => jina(u.toString())],
    ["exa", () => exa("web_fetch_exa", { url: u.toString() })],
  ]);
  return { url: u.toString(), text: clip(r.value, maxChars), via: r.route };
}

/** Search the web (semantic). */
export async function reachSearch(query: string, n = 5) {
  const r = await chain("search", [["exa", async () => parseExa(await exa("web_search_exa", { query, numResults: Math.max(1, Math.min(10, n)) }))]]);
  return { results: r.value.slice(0, n), via: r.route };
}

/** A Reddit feed (RSS/Atom XML) — new posts in subs, a search, or a thread's comments. `path` is like "r/forhire+slavelabour/new/.rss?limit=100". */
export async function reachRedditFeed(path: string, opts: { oauthJson?: () => Promise<string> } = {}) {
  const p = path.replace(/^\/+/, "");
  const routes: [string, () => Promise<string>][] = [];
  if (opts.oauthJson) routes.push(["reddit app", opts.oauthJson]);
  routes.push(["rss www", () => direct(`https://www.reddit.com/${p}`, "application/atom+xml, application/xml;q=0.9", REDDIT_UA)]);
  routes.push(["rss old", () => direct(`https://old.reddit.com/${p}`, "application/atom+xml, application/xml;q=0.9", REDDIT_UA)]);
  const r = await chain("reddit", routes);
  return { body: r.value, via: r.route };
}

/** Any RSS/Atom feed. */
export async function reachFeed(url: string) {
  const r = await chain("rss", [["direct", () => direct(url, "application/rss+xml, application/atom+xml, application/xml;q=0.9")]]);
  return r.value;
}

/** YouTube videos for a query: the Data API when you have a key, else Exa scoped to youtube.com. */
export async function reachYouTube(query: string, apiKey: string | null, n = 5) {
  const routes: [string, () => Promise<{ title: string; url: string; snippet: string; published: string | null }[]>][] = [];
  if (apiKey) {
    routes.push(["youtube api", async () => {
      const qs = new URLSearchParams({ part: "snippet", q: query, type: "video", maxResults: String(n), key: apiKey });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${qs}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { items?: { id: { videoId: string }; snippet: { title: string; description: string; publishedAt: string; channelTitle: string } }[] };
      return (j.items ?? []).map((i) => ({ title: i.snippet.title, url: `https://www.youtube.com/watch?v=${i.id.videoId}`, snippet: `${i.snippet.channelTitle}: ${i.snippet.description}`, published: i.snippet.publishedAt }));
    }]);
  }
  routes.push(["exa", async () => parseExa(await exa("web_search_exa", { query: `${query} site:youtube.com`, numResults: n })).filter((r) => /youtube\.com|youtu\.be/.test(r.url))]);
  const r = await chain("youtube", routes);
  return { results: r.value, via: r.route };
}

/** The doctor: probe every channel once (cheap requests) and report which route works. */
export async function reachDoctor(youtubeKey: string | null) {
  const probes: [string, () => Promise<unknown>][] = [
    ["web", () => reachRead("https://example.com", 500)],
    ["search", () => reachSearch("Sarajevo weather today", 1)],
    ["reddit", () => reachRedditFeed("r/forhire/new/.rss?limit=1")],
    ["rss", () => reachFeed("https://hnrss.org/frontpage?count=1")],
    ["youtube", () => reachYouTube("video editing tutorial", youtubeKey, 1)],
  ];
  await Promise.all(probes.map(([, fn]) => fn().catch(() => null)));
  return probes.map(([channel]) => ({ channel, ...(health.get(channel) ?? { ok: false, route: "none", at: Date.now(), error: "not probed" }) }));
}
