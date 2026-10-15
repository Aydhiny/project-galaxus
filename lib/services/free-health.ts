// Hourly free-model health checks (rules in lib/free-health.ts and
// lib/free-limits.ts). Each due provider gets a tiny request on its own model,
// and the answer refreshes what the router and the Free models dialog rely on:
// remaining quota from the headers, the resting state (cooldown), lastError /
// lastOkAt, and how many checks in a row failed (3+ = "unhealthy", tried last).
// A check is real usage, so it counts in today's requests, labelled as a health check.
//
// Honest verdicts: a rate limit (429 / quota) only rests the provider, it never
// counts as a failure. A missing model (404, 400 model_unavailable) tries the
// provider's other models, like askFree does, and saves the one that works;
// only a provider where NO model works fails. Calls respect the provider's
// minimum gap (Mistral ~1/s), shared with the router.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys, type FreeLlmKey } from "@/lib/db/schema";
import { tryDecrypt } from "@/lib/crypto-box";
import { cooldownMs, freeProvider, modelTrouble, modelsToTry, readRateHeaders } from "@/lib/free-llm";
import { HEALTH_MAX_TOKENS, HEALTH_PROMPT, HEALTH_TIMEOUT_MS, healthSkip } from "@/lib/free-health";
import { NO_MODEL_WORKS, classifyFailure, healable, healthFailsAfter, healthOutcome } from "@/lib/free-limits";
import { freeKeysFor, listModels } from "@/lib/services/free-llm";
import { waitTurn } from "@/lib/services/free-spacing";

const today = () => new Date().toISOString().slice(0, 10);
const baseOf = (k: FreeLlmKey) => (k.baseUrl ?? freeProvider(k.provider)?.baseUrl ?? "").replace(/\/+$/, "");

type Probe = { ok: boolean; res: Response | null; status: number; body: string; error: string | null; tokens: number; model: string };

/** One probe on one model: the provider's answer (ok or the error), its rate headers and tokens used. Never throws. */
async function probe(k: FreeLlmKey, model: string): Promise<Probe> {
  const key = tryDecrypt(k.keyEnc);
  try {
    const res = await fetch(`${baseOf(k)}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(k.provider === "openrouter" ? { "HTTP-Referer": "https://project-galaxus.vercel.app", "X-Title": "Galaxus Ops" } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "system", content: HEALTH_PROMPT.system }, { role: "user", content: HEALTH_PROMPT.prompt }], max_tokens: HEALTH_MAX_TOKENS, temperature: 0 }),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, res, status: res.status, body, error: `HTTP ${res.status} (${model}): ${body.slice(0, 200)}`, tokens: 0, model };
    // A 200 is a pass even if a reasoning model spent all 300 tokens thinking: the key, the quota and the model all work.
    let tokens = 0;
    try { tokens = (JSON.parse(body) as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0; } catch { /* not JSON: still alive */ }
    return { ok: true, res, status: res.status, body: "", error: null, tokens, model };
  } catch (e) {
    const error = `Health check failed: ${e instanceof Error ? e.message : "no answer"}`.slice(0, 300);
    return { ok: false, res: null, status: 0, body: error, error, tokens: 0, model };
  }
}

/** Your model first; if the provider says the MODEL is missing or busy, its other models (as askFree does). */
async function checkProvider(k: FreeLlmKey) {
  const attempts: Probe[] = [];
  let models = modelsToTry(k.provider, k.model);
  let listed = false;
  for (let i = 0; i < models.length; i++) {
    if (!(await waitTurn(k.id, k.provider))) break; // spaced out: try again next beat
    const r = await probe(k, models[i]);
    attempts.push(r);
    if (r.ok) break;
    const kind = classifyFailure(r.status, r.body);
    if (kind !== "missing" && kind !== "busy") break; // key, server or rate limit: other models won't help
    if (kind === "missing" && !listed) {
      listed = true;
      const done = models.slice(0, i + 1);
      models = [...done, ...modelsToTry(k.provider, models[i], await listModels(k)).filter((m) => !done.includes(m))].slice(0, 4);
    }
  }
  return attempts;
}

/** Write what the check learned, the same way real use does (lib/services/free-llm.ts noteUse), plus the health fields. */
async function record(k: FreeLlmKey, attempts: Probe[]) {
  const t = today();
  const fresh = String(k.day ?? "") === t;
  const outcome = healthOutcome(attempts);
  const last = attempts.at(-1);
  const good = attempts.find((a) => a.ok);
  const withHeaders = [...attempts].reverse().find((a) => a.res);
  const h = withHeaders?.res ? readRateHeaders(withHeaders.res.headers) : { remainingRequests: null, limitRequests: null, remainingTokens: null };
  // The model you had is missing, another one works: keep the one that works (and say so in the dialog).
  const switched = good && good.model !== k.model && attempts.some((a) => !a.ok && classifyFailure(a.status, a.body) === "missing");
  const allMissing = outcome === "fail" && attempts.every((a) => !a.ok && classifyFailure(a.status, a.body) === "missing");
  const error = last?.error ? (allMissing ? `${NO_MODEL_WORKS} for this key (tried ${attempts.map((a) => a.model).join(", ")}): ${last.error}` : last.error) : null;
  const busy = outcome === "busy" || (last && !last.ok && modelTrouble(last.status, last.body) === "busy");
  await db.update(freeLlmKeys).set({
    day: t,
    requests: (fresh ? k.requests : 0) + attempts.length,
    tokens: (fresh ? k.tokens : 0) + attempts.reduce((s, a) => s + a.tokens, 0),
    healthChecks: (fresh ? k.healthChecks : 0) + attempts.length,
    healthAt: new Date(),
    healthFails: healthFailsAfter(k.healthFails, outcome),
    ...(h.remainingRequests != null ? { remainingRequests: h.remainingRequests, limitRequests: h.limitRequests, remainingTokens: h.remainingTokens, headersAt: new Date() } : {}),
    ...(switched ? { model: good!.model, switchedFrom: k.model } : {}),
    ...(outcome === "pass"
      ? { lastError: null, lastOkAt: new Date() }
      : { lastError: (error ?? "failed").slice(0, 300), cooldownUntil: new Date(Date.now() + cooldownMs(busy ? 503 : last?.status ?? 0, last?.body ?? "", busy ? "120" : last?.res?.headers.get("retry-after") ?? null)) }),
  }).where(eq(freeLlmKeys.id, k.id));
  return { outcome, switched: switched ? good!.model : null };
}

/**
 * Check every due provider of one user (in parallel, each capped at 20 s per
 * model, so a scheduler beat isn't held up). Returns what happened per
 * provider, for the scheduler's log.
 */
export async function healthCheckFor(userId: number) {
  const t = today();
  let keys = await freeKeysFor(userId);
  // Healing: a provider marked unhealthy only by rate limits or a missing model (before checks knew
  // better) isn't broken. Wipe its failures now, so it's back in its place without you clicking Test.
  const heal = keys.filter((k) => k.healthFails > 0 && healable(k.lastError));
  if (heal.length) {
    for (const k of heal) await db.update(freeLlmKeys).set({ healthFails: 0 }).where(eq(freeLlmKeys.id, k.id));
    keys = await freeKeysFor(userId);
  }
  const out: Record<string, string> = {};
  const due = keys.filter((k) => {
    const skip = healthSkip(k, t);
    if (skip) out[k.provider] = `skipped: ${skip}`;
    return !skip;
  });
  await Promise.all(due.map(async (k) => {
    const attempts = await checkProvider(k);
    if (!attempts.length) { out[k.provider] = "skipped: spacing"; return; }
    const r = await record(k, attempts);
    out[k.provider] = r.outcome === "pass" ? (r.switched ? `ok (switched to ${r.switched})` : "ok")
      : r.outcome === "rate" ? "resting: rate limit" : r.outcome === "busy" ? "resting: model busy"
      : `failed (${healthFailsAfter(k.healthFails, "fail")} in a row)`;
  }));
  return { checked: due.length, providers: out };
}
