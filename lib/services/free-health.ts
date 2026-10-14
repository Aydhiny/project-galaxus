// Hourly free-model health checks (rules in lib/free-health.ts). Each due
// provider gets ONE tiny request on its own model, and the answer refreshes
// what the router and the Free models dialog rely on: remaining quota from the
// headers, the resting state (cooldown), lastError / lastOkAt, and how many
// checks in a row failed (3+ = "unhealthy", tried last). A check is real usage,
// so it counts in today's requests, labelled as a health check.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys, type FreeLlmKey } from "@/lib/db/schema";
import { tryDecrypt } from "@/lib/crypto-box";
import { cooldownMs, freeProvider, modelTrouble, readRateHeaders } from "@/lib/free-llm";
import { HEALTH_MAX_TOKENS, HEALTH_PROMPT, HEALTH_TIMEOUT_MS, healthSkip, nextHealthFails } from "@/lib/free-health";
import { freeKeysFor } from "@/lib/services/free-llm";

const today = () => new Date().toISOString().slice(0, 10);
const baseOf = (k: FreeLlmKey) => (k.baseUrl ?? freeProvider(k.provider)?.baseUrl ?? "").replace(/\/+$/, "");

/** One probe: the provider's answer (ok or the error), its rate headers and tokens used. Never throws. */
async function probe(k: FreeLlmKey) {
  const key = tryDecrypt(k.keyEnc);
  try {
    const res = await fetch(`${baseOf(k)}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(k.provider === "openrouter" ? { "HTTP-Referer": "https://project-galaxus.vercel.app", "X-Title": "Galaxus Ops" } : {}) },
      body: JSON.stringify({ model: k.model, messages: [{ role: "system", content: HEALTH_PROMPT.system }, { role: "user", content: HEALTH_PROMPT.prompt }], max_tokens: HEALTH_MAX_TOKENS, temperature: 0 }),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, res, status: res.status, error: `HTTP ${res.status} (${k.model}): ${body.slice(0, 200)}`, tokens: 0 };
    // A 200 is a pass even if a reasoning model spent all 300 tokens thinking: the key, the quota and the model all work.
    let tokens = 0;
    try { tokens = (JSON.parse(body) as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0; } catch { /* not JSON: still alive */ }
    return { ok: true, res, status: res.status, error: null, tokens };
  } catch (e) {
    return { ok: false, res: null, status: 0, error: `Health check failed: ${e instanceof Error ? e.message : "no answer"}`.slice(0, 300), tokens: 0 };
  }
}

/** Write what the probe learned, the same way real use does (lib/services/free-llm.ts noteUse), plus the health fields. */
async function record(k: FreeLlmKey, r: Awaited<ReturnType<typeof probe>>) {
  const t = today();
  const fresh = String(k.day ?? "") === t;
  const h = r.res ? readRateHeaders(r.res.headers) : { remainingRequests: null, limitRequests: null, remainingTokens: null };
  // A busy model passes soon: rest it briefly, like the router does. Anything else rests by its usual rule.
  const busy = !r.ok && modelTrouble(r.status, r.error ?? "") === "busy";
  await db.update(freeLlmKeys).set({
    day: t,
    requests: (fresh ? k.requests : 0) + 1,
    tokens: (fresh ? k.tokens : 0) + r.tokens,
    healthChecks: (fresh ? k.healthChecks : 0) + 1,
    healthAt: new Date(),
    healthFails: nextHealthFails(k.healthFails, r.ok),
    ...(h.remainingRequests != null ? { remainingRequests: h.remainingRequests, limitRequests: h.limitRequests, remainingTokens: h.remainingTokens, headersAt: new Date() } : {}),
    ...(r.ok
      ? { lastError: null, lastOkAt: new Date() }
      : { lastError: (r.error ?? "failed").slice(0, 300), cooldownUntil: new Date(Date.now() + cooldownMs(busy ? 503 : r.status, r.error ?? "", busy ? "120" : r.res?.headers.get("retry-after") ?? null)) }),
  }).where(eq(freeLlmKeys.id, k.id));
}

/**
 * Check every due provider of one user (in parallel, each capped at 20 s, so a
 * scheduler beat isn't held up). Returns what happened per provider, for the
 * scheduler's log.
 */
export async function healthCheckFor(userId: number) {
  const t = today();
  const keys = await freeKeysFor(userId);
  const out: Record<string, string> = {};
  const due = keys.filter((k) => {
    const skip = healthSkip(k, t);
    if (skip) out[k.provider] = `skipped: ${skip}`;
    return !skip;
  });
  await Promise.all(due.map(async (k) => {
    const r = await probe(k);
    await record(k, r);
    out[k.provider] = r.ok ? "ok" : `failed (${nextHealthFails(k.healthFails, false)} in a row)`;
  }));
  return { checked: due.length, providers: out };
}
