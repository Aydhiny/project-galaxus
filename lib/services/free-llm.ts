// The free-model router. askFree() tries your free LLM providers in your
// priority order, skipping any that are resting (cooldown) or out for the
// day; on a rate limit or error it rests that provider and moves to the next
// one, so agents keep working when one runs out. Usage is counted per day and
// exact remaining quota is read from response headers when a provider sends it.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys, type FreeLlmKey } from "@/lib/db/schema";
import { encrypt, tryDecrypt } from "@/lib/crypto-box";
import { FREE_PROVIDERS, cooldownMs, freeProvider, pickOrder, readRateHeaders, remainingToday } from "@/lib/free-llm";

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
    lastError: k.lastError, lastOkAt: k.lastOkAt,
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
  if (p.key === "custom") {
    try {
      const u = new URL(String(raw.baseUrl ?? "").trim());
      if (u.protocol !== "https:") throw new Error();
      baseUrl = u.toString().replace(/\/+$/, "");
    } catch { throw new Error("Base URL must be an https:// address, e.g. https://api.groq.com/openai/v1"); }
  }
  const key = raw.key?.trim();
  if (key != null && key !== "" && (key.length < 8 || key.length > 400)) throw new Error("That key doesn't look right.");
  const [existing] = await db.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, userId), eq(freeLlmKeys.provider, p.key))).limit(1);
  if (!existing && !key && p.key !== "llm7") throw new Error(`Paste your ${p.name} key (get one free at ${p.keyUrl}).`);
  const values = {
    model, baseUrl, enabled: raw.enabled ?? true, cooldownUntil: null, lastError: null,
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

async function call(k: FreeLlmKey, messages: Msg[], maxTokens: number, json: boolean) {
  const p = freeProvider(k.provider);
  const base = (k.baseUrl ?? p?.baseUrl ?? "").replace(/\/+$/, "");
  const key = tryDecrypt(k.keyEnc);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(k.provider === "openrouter" ? { "HTTP-Referer": "https://project-galaxus.vercel.app", "X-Title": "Galaxus Ops" } : {}) },
    body: JSON.stringify({ model: k.model, messages, max_tokens: maxTokens, temperature: 0.4, ...(json ? { response_format: { type: "json_object" } } : {}) }),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
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
    ...(h.remainingRequests != null ? { remainingRequests: h.remainingRequests, limitRequests: h.limitRequests, remainingTokens: h.remainingTokens, headersAt: new Date() } : {}),
    ...(error
      ? { lastError: error.slice(0, 300), cooldownUntil: new Date(Date.now() + cooldownMs(status, error, retryAfter)) }
      : { lastError: null, lastOkAt: new Date() }),
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
    let res: Response | null = null;
    try {
      res = await call(k, messages, o.maxTokens ?? 3000, !!o.json);
      const body = await res.text();
      if (!res.ok) {
        await noteUse(k, res, 0, `HTTP ${res.status}: ${body.slice(0, 200)}`, res.status, res.headers.get("retry-after"));
        reasons.push(`${k.provider}: HTTP ${res.status}`);
        continue;
      }
      const j = JSON.parse(body) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
      const text = j.choices?.[0]?.message?.content?.trim() ?? "";
      await noteUse(k, res, j.usage?.total_tokens ?? Math.ceil((o.prompt.length + text.length) / 4), text ? null : "Empty answer", text ? 0 : 500);
      if (!text) { reasons.push(`${k.provider}: empty answer`); continue; }
      return { text, provider: k.provider, model: k.model, name: freeProvider(k.provider)?.name ?? k.provider };
    } catch (e) {
      await noteUse(k, res, 0, e instanceof Error ? e.message : "Request failed", 0);
      reasons.push(`${k.provider}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  throw new Error(`Every free model failed (${reasons.join("; ")}).`);
}

/** "Test" in the UI: one tiny request, and the models the provider lists for your key. */
export async function testFreeKeyFor(userId: number, id: number) {
  const [k] = await db.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.id, id), eq(freeLlmKeys.userId, userId))).limit(1);
  if (!k) throw new Error("Not found.");
  const base = (k.baseUrl ?? freeProvider(k.provider)?.baseUrl ?? "").replace(/\/+$/, "");
  const key = tryDecrypt(k.keyEnc);
  let models: string[] = [];
  try {
    const r = await fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (r.ok) models = (((await r.json()) as { data?: { id: string }[] }).data ?? []).map((m) => m.id).slice(0, 200);
  } catch { /* listing is optional */ }
  await db.update(freeLlmKeys).set({ cooldownUntil: null }).where(eq(freeLlmKeys.id, k.id)); // a manual test gets a fresh chance
  const r = await askFree(userId, { system: "Reply with exactly: ok", prompt: "Say ok.", maxTokens: 10, only: [k.id] });
  return { ok: true, reply: r.text.slice(0, 40), models };
}

export const FREE_CATALOG = FREE_PROVIDERS;
