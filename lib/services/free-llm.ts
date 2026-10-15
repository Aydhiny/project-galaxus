// The free-model router. askFree() tries your free LLM providers in your
// priority order, skipping any that are resting (cooldown) or out for the
// day; on a rate limit or error it rests that provider and moves to the next
// one, so agents keep working when one runs out. Usage is counted per day and
// exact remaining quota is read from response headers when a provider sends it.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys, type FreeLlmKey } from "@/lib/db/schema";
import { encrypt, tryDecrypt } from "@/lib/crypto-box";
import { waitTurn } from "@/lib/services/free-spacing";
import { isPublicUrl, safeFetch } from "@/lib/safe-fetch";
import { scrubSecret } from "@/lib/scrub-secret";
import { FREE_PROVIDERS, cooldownMs, freeProvider, isUnhealthy, modelTrouble, modelsToTry, pickOrder, readRateHeaders, remainingToday } from "@/lib/free-llm";

const today = () => new Date().toISOString().slice(0, 10);

export async function freeKeysFor(userId: number) {
  return db.select().from(freeLlmKeys).where(eq(freeLlmKeys.userId, userId)).orderBy(freeLlmKeys.priority, freeLlmKeys.id);
}

/** For the UI: each saved provider with what's left today (never the key itself). */
export async function freeStatusFor(userId: number) {
  const t = today();
  const keys = await freeKeysFor(userId);
  const rows = keys.map((k) => ({
    id: k.id, provider: k.provider, name: freeProvider(k.provider)?.name ?? k.provider, model: k.model, baseUrl: k.baseUrl,
    enabled: k.enabled, priority: k.priority, hasKey: !!k.keyEnc,
    left: remainingToday(k, t), cooldownUntil: k.cooldownUntil && k.cooldownUntil.getTime() > Date.now() ? k.cooldownUntil : null,
    lastError: k.lastError, lastOkAt: k.lastOkAt, switchedFrom: k.switchedFrom ?? null,
    // Hourly health checks (lib/free-health.ts): counted in today's requests, but labelled.
    unhealthy: isUnhealthy(k), healthFails: k.healthFails, healthAt: k.healthAt, healthChecksToday: String(k.day ?? "") === t ? k.healthChecks : 0,
  }));
  const usable = pickOrder(keys, t);
  const total = usable.reduce((s, k) => s + (remainingToday(k, t).requests ?? 0), 0);
  return { providers: rows, usableCount: usable.length, requestsLeftToday: total, unlimited: usable.some((k) => remainingToday(k, t).requests == null) };
}
export type FreeStatus = Awaited<ReturnType<typeof freeStatusFor>>;

export async function saveFreeKeyFor(userId: number, raw: { provider: string; key?: string | null; model?: string; baseUrl?: string; enabled?: boolean; priority?: number }) {
  const p = freeProvider(raw.provider);
  if (!p) throw new Error("Unknown provider.");
  const model = String(raw.model ?? p.models[0]?.id ?? "").trim().slice(0, 120);
  if (!model) throw new Error("Pick a model id.");
  let baseUrl: string | null = null;
  if (!p.baseUrl) { // custom and OmniRoute: you give the address
    try {
      const u = new URL(String(raw.baseUrl ?? "").trim());
      if (u.protocol !== "https:") throw new Error();
      baseUrl = u.toString().replace(/\/+$/, "");
    } catch { throw new Error("Base URL must be an https:// address, e.g. https://api.groq.com/openai/v1"); }
    // SSRF guard: the server calls this address with your key, so it must be on the public internet.
    if (!isPublicUrl(baseUrl, { httpsOnly: true })) throw new Error("Base URL must be a public https:// address (not localhost or a private network).");
  }
  const key = raw.key?.trim();
  if (key != null && key !== "" && (key.length < 8 || key.length > 400)) throw new Error("That key doesn't look right.");
  const [existing] = await db.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, userId), eq(freeLlmKeys.provider, p.key))).limit(1);
  if (!existing && !key && p.key !== "llm7") throw new Error(`Paste your ${p.name} key (get one free at ${p.keyUrl}).`);
  const values = {
    model, baseUrl, enabled: raw.enabled ?? true, cooldownUntil: null, lastError: null,
    ...(existing && existing.model !== model ? { switchedFrom: null } : {}), // you picked the model yourself
    ...(raw.priority != null ? { priority: Math.max(0, Math.min(99, Math.round(raw.priority))) } : {}),
    ...(key ? { keyEnc: encrypt(key) } : {}),
  };
  if (existing) await db.update(freeLlmKeys).set(values).where(eq(freeLlmKeys.id, existing.id));
  else {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(freeLlmKeys).where(eq(freeLlmKeys.userId, userId));
    await db.insert(freeLlmKeys).values({ userId, provider: p.key, priority: n, ...values });
  }
}

export async function removeFreeKeyFor(userId: number, id: number) {
  await db.delete(freeLlmKeys).where(and(eq(freeLlmKeys.id, id), eq(freeLlmKeys.userId, userId)));
}

/** Move a provider up/down in your order. */
export async function moveFreeKeyFor(userId: number, id: number, dir: -1 | 1) {
  const keys = await freeKeysFor(userId);
  const i = keys.findIndex((k) => k.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return;
  const order = [...keys];
  [order[i], order[j]] = [order[j], order[i]];
  for (const [k, row] of order.entries()) await db.update(freeLlmKeys).set({ priority: k }).where(eq(freeLlmKeys.id, row.id));
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

const baseOf = (k: FreeLlmKey) => (k.baseUrl ?? freeProvider(k.provider)?.baseUrl ?? "").replace(/\/+$/, "");

/** The models this key can actually use, as the provider lists them (empty if it won't say). */
export async function listModels(k: FreeLlmKey) {
  const key = tryDecrypt(k.keyEnc);
  try {
    const r = await safeFetch(`${baseOf(k)}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, cache: "no-store" }, { timeoutMs: 15_000 });
    if (!r.ok) return [];
    // OpenAI shape ({data:[{id}]}); Gemini's OpenAI layer answers ids like "models/gemini-…".
    return (((await r.json()) as { data?: { id: string }[] }).data ?? []).map((m) => m.id.replace(/^models\//, "")).slice(0, 300);
  } catch { return []; }
}

async function call(k: FreeLlmKey, model: string, messages: Msg[], maxTokens: number, json: boolean) {
  const key = tryDecrypt(k.keyEnc);
  // safeFetch: a custom/OmniRoute base URL is user-chosen, so public addresses only (and the key never follows a redirect off-origin).
  const res = await safeFetch(`${baseOf(k)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(k.provider === "openrouter" ? { "HTTP-Referer": "https://project-galaxus.vercel.app", "X-Title": "Galaxus Ops" } : {}) },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.4, ...(json ? { response_format: { type: "json_object" } } : {}) }),
    cache: "no-store",
  }, { timeoutMs: 60_000 });
  return res;
}

async function noteUse(k: FreeLlmKey, res: Response | null, tokens: number, error: string | null, status = 0, retryAfter: string | null = null) {
  const t = today();
  const fresh = String(k.day ?? "") === t;
  const h = res ? readRateHeaders(res.headers) : { remainingRequests: null, limitRequests: null, remainingTokens: null };
  await db.update(freeLlmKeys).set({
    day: t,
    requests: (fresh ? k.requests : 0) + 1,
    tokens: (fresh ? k.tokens : 0) + tokens,
    ...(fresh ? {} : { healthChecks: 0 }), // a new day: today's health-check count starts over
    ...(h.remainingRequests != null ? { remainingRequests: h.remainingRequests, limitRequests: h.limitRequests, remainingTokens: h.remainingTokens, headersAt: new Date() } : {}),
    ...(error
      ? { lastError: scrubSecret(error, tryDecrypt(k.keyEnc)).slice(0, 300), cooldownUntil: new Date(Date.now() + cooldownMs(status, error, retryAfter)) }
      : { lastError: null, lastOkAt: new Date(), healthFails: 0 }), // real work succeeding counts as passing a health check
  }).where(eq(freeLlmKeys.id, k.id));
}

/**
 * Ask a free model. Tries each usable provider in order until one answers.
 * Returns the text and which provider/model answered, or throws with every
 * provider's reason when none could.
 */
export async function askFree(userId: number, o: { system: string; prompt: string; maxTokens?: number; json?: boolean; only?: number[] }) {
  const keys = pickOrder(await freeKeysFor(userId), today()).filter((k) => !o.only || o.only.includes(k.id));
  if (!keys.length) throw new Error("No free model available: add a key in Ops → Free models, or they're all used up for today.");
  const messages: Msg[] = [{ role: "system", content: o.system }, { role: "user", content: o.prompt }];
  const reasons: string[] = [];
  for (const k of keys.slice(0, 5)) {
    // One provider, up to 3 models: a missing or overloaded MODEL isn't a reason to give up on the provider.
    let models = modelsToTry(k.provider, k.model);
    let listed = false;
    let last: { res: Response | null; error: string; status: number } | null = null;
    let queued = false;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      let res: Response | null = null;
      // Tight per-second limits (Mistral): wait for this provider's next slot, or move on if the queue is long.
      if (!(await waitTurn(k.id, k.provider))) { queued = true; break; }
      try {
        res = await call(k, model, messages, o.maxTokens ?? 3000, !!o.json);
        const body = await res.text();
        if (!res.ok) {
          last = { res, error: `HTTP ${res.status} (${model}): ${body.slice(0, 200)}`, status: res.status };
          const trouble = modelTrouble(res.status, body);
          if (!trouble) break; // key, quota or rate limit: the whole provider rests
          // The model is the problem: ask the provider which models this key can use (once), then try the next one.
          if (trouble === "missing" && !listed) { listed = true; models = [...models.slice(0, i + 1), ...modelsToTry(k.provider, model, await listModels(k)).filter((m) => !models.slice(0, i + 1).includes(m))].slice(0, 4); }
          continue;
        }
        const j = JSON.parse(body) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
        const text = j.choices?.[0]?.message?.content?.trim() ?? "";
        if (!text) { last = { res, error: `Empty answer (${model})`, status: 503 }; continue; }
        await noteUse(k, res, j.usage?.total_tokens ?? Math.ceil((o.prompt.length + text.length) / 4), null);
        // Your model doesn't exist (any more) for this key, another one worked: keep the one that works.
        if (model !== k.model && last && modelTrouble(last.status, last.error) === "missing") await db.update(freeLlmKeys).set({ model, switchedFrom: k.model }).where(eq(freeLlmKeys.id, k.id));
        return { text, provider: k.provider, model, name: freeProvider(k.provider)?.name ?? k.provider };
      } catch (e) {
        last = { res, error: e instanceof Error ? e.message : "Request failed", status: 0 };
        break;
      }
    }
    if (last) {
      // Every model was missing/busy: rest briefly if busy (it passes), longer if nothing exists for this key.
      const busy = modelTrouble(last.status, last.error) === "busy";
      await noteUse(k, last.res, 0, last.error, busy ? 503 : last.status, busy ? "120" : last.res?.headers.get("retry-after") ?? null);
      reasons.push(`${k.provider}: ${scrubSecret(last.error, tryDecrypt(k.keyEnc)).slice(0, 80)}`);
    } else if (queued) reasons.push(`${k.provider}: too many calls queued right now`); // not an error: nothing to rest
  }
  throw new Error(`Every free model failed (${reasons.join("; ")}).`);
}

/** "Test" in the UI: one tiny request, and the models the provider lists for your key. */
export async function testFreeKeyFor(userId: number, id: number) {
  const [k] = await db.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.id, id), eq(freeLlmKeys.userId, userId))).limit(1);
  if (!k) throw new Error("Not found.");
  const models = await listModels(k);
  // Your model isn't one this key can use: switch to the best one it can (catalog order), before testing.
  const fix = models.length && !models.includes(k.model) ? modelsToTry(k.provider, k.model, models).find((m) => models.includes(m)) : undefined;
  await db.update(freeLlmKeys).set({ cooldownUntil: null, ...(fix ? { model: fix, switchedFrom: k.model } : {}) }).where(eq(freeLlmKeys.id, k.id)); // a manual test gets a fresh chance
  // Room to answer: reasoning models (gpt-oss, nemotron…) think first, and 10 tokens left them with nothing to say.
  const r = await askFree(userId, { system: "Reply with exactly: ok", prompt: "Say ok.", maxTokens: 400, only: [k.id] });
  return { ok: true, reply: r.text.slice(0, 40), models, model: r.model, switchedFrom: r.model !== k.model ? k.model : null };
}

export const FREE_CATALOG = FREE_PROVIDERS;
