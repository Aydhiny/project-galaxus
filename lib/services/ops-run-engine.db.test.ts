// @vitest-environment node
//
// Run engines and honest free-model health, against a REAL Postgres (PGlite)
// with the app's schema and the production migration statements:
//   - a health check that hits a rate limit rests the provider, never marks it unhealthy
//   - a model the provider no longer serves (LLM7's 400 model_unavailable) makes the
//     check try the provider's other models, save the one that works, and pass
//   - old rows marked unhealthy by rate limits heal without you clicking Test
//   - calls to Mistral are spaced (~1/s free tier), across parallel callers
//   - a free run records what it ran on, on the agent and on the mission; a Claude run too
// The only stand-ins are the outside HTTP services: `fetch` answers like they do.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
const client = new PGlite();
const testDb = drizzle(client, { schema });
const h = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  calls: [] as { url: string; body: string; at: number }[],
  reply: (() => ({ status: 200, text: "ok" })) as (url: string, body: string) => { status: number; text: string; headers?: Record<string, string> },
  models: null as null | ((url: string) => { status: number; text: string }),
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
// after(): run the work, and let the test wait for it (as Vercel's waitUntil would).
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const free = await import("@/lib/services/free-llm");
const health = await import("@/lib/services/free-health");
const inbox = await import("@/lib/services/ops-inbox");
const tokens = await import("@/lib/services/api-tokens");
const { opsMissions, opsAgents, freeLlmKeys, users } = schema;

let me = 0, sara = 0, emir = 0;
const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string, headers: Record<string, string> = {}) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }), headers });
const llmCalls = () => h.calls.filter((c) => c.url.endsWith("/chat/completions"));
const keyOf = async (userId: number, p: string) => (await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, userId), eq(freeLlmKeys.provider, p))))[0];

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : "";
  h.calls.push({ url, body, at: Date.now() });
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url, body);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }
  if (url.endsWith("/models") && h.models) { const r = h.models(url); return new Response(r.text, { status: r.status, headers: { "content-type": "application/json" } }); }
  if (url === "https://mcp.exa.ai/mcp") {
    const text = "Title: Freelance rates in Bosnia\nURL: https://example.com/rates\nPublished: 2026-10-01T00:00:00Z\nHighlights:\nDesigners charge 20-40 EUR an hour.";
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  }
  if (url === "https://example.com/rates") return new Response(`<html><body><p>${"Designers in Sarajevo charge 20-40 EUR an hour. ".repeat(6)}</p></body></html>`, { headers: { "content-type": "text/html" } });
  return new Response("not found", { status: 404 });
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test" }).returning())[0].id;
  sara = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;
  emir = (await testDb.insert(users).values({ name: "Emir", email: "emir@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("free-model health checks are honest", () => {
  it("a 429 rests the provider and never marks it unhealthy, however many times it happens", async () => {
    await free.saveFreeKeyFor(me, { provider: "mistral", key: "mistral_test_1234567890", model: "mistral-small-latest" });
    h.reply = () => ({ status: 429, text: '{"message":"Rate limit exceeded","type":"rate_limited"}' });
    for (let i = 0; i < 4; i++) {
      const r = await health.healthCheckFor(me);
      expect(r.providers.mistral).toBe("resting: rate limit");
      const k = await keyOf(me, "mistral");
      expect(k.healthFails).toBe(0);
      expect(k.cooldownUntil!.getTime()).toBeGreaterThan(Date.now()); // resting, so missions skip it for now
      // Next hour: the rest and the interval are over.
      await testDb.update(freeLlmKeys).set({ cooldownUntil: null, healthAt: null, lastCallAt: null }).where(eq(freeLlmKeys.id, k.id));
    }
    const st = (await free.freeStatusFor(me)).providers.find((p) => p.provider === "mistral")!;
    expect(st.unhealthy).toBe(false);
    expect(st.lastError).toContain("HTTP 429");
  });

  it("a model the provider no longer serves: the check tries its other models, saves the one that works, and passes", async () => {
    await free.saveFreeKeyFor(me, { provider: "llm7", model: "gpt-oss-20b" }); // keyless, on the old id
    const before = llmCalls().length;
    h.reply = (url, body) => {
      const { model } = JSON.parse(body) as { model: string };
      return model === "gpt-oss-20b"
        ? { status: 400, text: "{\"error\":{\"message\":\"Model 'gpt-oss-20b' is currently unavailable\",\"code\":\"model_unavailable\"}}" }
        : llm("ok");
    };
    h.models = () => ({ status: 200, text: JSON.stringify({ data: [{ id: "gpt-oss:20b" }, { id: "GLM-5.3-Flash" }, { id: "whisper-large-v3" }] }) });
    const r = await health.healthCheckFor(me);
    expect(r.providers.llm7).toBe("ok (switched to gpt-oss:20b)");
    const sent = llmCalls().slice(before).filter((c) => c.url.includes("llm7")).map((c) => (JSON.parse(c.body) as { model: string }).model);
    expect(sent).toEqual(["gpt-oss-20b", "gpt-oss:20b"]);
    expect(await keyOf(me, "llm7")).toMatchObject({ model: "gpt-oss:20b", switchedFrom: "gpt-oss-20b", healthFails: 0, lastError: null, healthChecks: 2 });
    // The dialog can say "Switched model to gpt-oss:20b".
    expect((await free.freeStatusFor(me)).providers.find((p) => p.provider === "llm7")).toMatchObject({ model: "gpt-oss:20b", switchedFrom: "gpt-oss-20b", unhealthy: false });
    h.models = null;
  });

  it("only a provider where NO model works fails", async () => {
    await free.saveFreeKeyFor(sara, { provider: "llm7", model: "gpt-oss:20b" });
    h.reply = () => ({ status: 404, text: '{"error":{"code":"model_not_found"}}' });
    const r = await health.healthCheckFor(sara);
    expect(r.providers.llm7).toBe("failed (1 in a row)");
    const k = await keyOf(sara, "llm7");
    expect(k.healthFails).toBe(1);
    expect(k.lastError).toMatch(/^No model works/);
  });

  it("an old row marked unhealthy by rate limits heals on the next check, even while it rests", async () => {
    await free.saveFreeKeyFor(emir, { provider: "groq", key: "gsk_emir_1234567890", model: "openai/gpt-oss-120b" });
    const k = await keyOf(emir, "groq");
    await testDb.update(freeLlmKeys).set({ healthFails: 3, lastError: "HTTP 429 (openai/gpt-oss-120b): Rate limit exceeded", cooldownUntil: new Date(Date.now() + 60_000) }).where(eq(freeLlmKeys.id, k.id));
    expect((await free.freeStatusFor(emir)).providers[0].unhealthy).toBe(true);
    const r = await health.healthCheckFor(emir);
    expect(r.providers.groq).toBe("skipped: resting");
    expect((await keyOf(emir, "groq")).healthFails).toBe(0);
    expect((await free.freeStatusFor(emir)).providers[0].unhealthy).toBe(false);
    // A real failure is never healed away.
    await testDb.update(freeLlmKeys).set({ healthFails: 3, lastError: "HTTP 401 (x): invalid api key" }).where(eq(freeLlmKeys.id, k.id));
    await health.healthCheckFor(emir);
    expect((await keyOf(emir, "groq")).healthFails).toBe(3);
    await testDb.update(freeLlmKeys).set({ healthFails: 0, lastError: null, cooldownUntil: null }).where(eq(freeLlmKeys.id, k.id));
  });
});

describe("spacing calls to Mistral", () => {
  it("two callers at once: the second waits its turn (~1.5 s), it doesn't collide into a 429", async () => {
    const k = await keyOf(me, "mistral");
    await testDb.update(freeLlmKeys).set({ cooldownUntil: null, lastCallAt: null, priority: 0 }).where(eq(freeLlmKeys.id, k.id));
    h.reply = () => llm("ok from mistral");
    const before = llmCalls().length;
    const [a, b] = await Promise.all([free.askFree(me, { system: "s", prompt: "1", only: [k.id] }), free.askFree(me, { system: "s", prompt: "2", only: [k.id] })]);
    expect([a.provider, b.provider]).toEqual(["mistral", "mistral"]);
    const at = llmCalls().slice(before).map((c) => c.at).sort((x, y) => x - y);
    expect(at).toHaveLength(2);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(1_400);
    expect((await keyOf(me, "mistral")).lastCallAt).not.toBeNull();
  }, 15_000);
});

describe("what an agent actually runs on", () => {
  it("a free run records its provider and model on the agent and the mission", async () => {
    await free.saveFreeKeyFor(sara, { provider: "gemini", key: "AIza_sara_1234567890", model: "gemini-3.8-flash" });
    await testDb.update(freeLlmKeys).set({ priority: 0 }).where(eq(freeLlmKeys.id, (await keyOf(sara, "gemini")).id));
    await testDb.update(freeLlmKeys).set({ enabled: false }).where(eq(freeLlmKeys.id, (await keyOf(sara, "llm7")).id));
    h.reply = (url) => url.includes("generativelanguage") ? llm("## Rates\n- 20-40 EUR/h [1]\n\n[1] https://example.com/rates") : { status: 500, text: "no" };
    const { agent } = await ops.createAgentFor(sara, { name: "Novacheck", role: "researcher", provider: "claude", cloud: true });
    // Before any run: no engine recorded (the badge shows the neutral "auto" cloud, never Claude).
    expect(agent).toMatchObject({ provider: "claude", engine: "auto", runEngine: null, runModel: null });
    const m = await ops.createMissionFor(sara, { title: "Freelance design rates in Sarajevo", kind: "research", agentId: agent.id }) as { id: number };
    await settle();
    const [a] = await testDb.select().from(opsAgents).where(eq(opsAgents.id, agent.id));
    expect(a).toMatchObject({ runEngine: "gemini", runModel: "gemini-3.8-flash" });
    const [done] = await testDb.select().from(opsMissions).where(eq(opsMissions.id, m.id));
    expect(done).toMatchObject({ status: "submitted", ranOn: "gemini:gemini-3.8-flash" });
    // The overview carries it to the UI.
    const ov = await ops.opsOverviewFor(sara);
    expect(ov.agents.find((x) => x.id === agent.id)).toMatchObject({ runEngine: "gemini", runModel: "gemini-3.8-flash" });
    expect(ov.events.some((e) => e.agentId === agent.id && e.label.includes("gemini-3.8-flash"))).toBe(true);
  }, 60_000);

  it("a Claude run records Claude and the model it was given", async () => {
    await tokens.createApiTokenFor(emir, "Runner", "voice"); // Claude connected via the runner
    await inbox.saveOpsSettingsFor(emir, { monthlyBudgetUsd: 15 });
    await testDb.update(freeLlmKeys).set({ enabled: false }).where(eq(freeLlmKeys.userId, emir));
    const { agent } = await ops.createAgentFor(emir, { name: "Testy", role: "researcher", provider: "claude", cloud: true, engine: "claude" });
    const m = await ops.createMissionFor(emir, { title: "Deep market scan", kind: "research", agentId: agent.id }) as { id: number };
    const [claimed] = await testDb.select().from(opsMissions).where(eq(opsMissions.id, m.id));
    expect(claimed.jobId).toBeGreaterThan(0); // a real runner job
    const [a] = await testDb.select().from(opsAgents).where(eq(opsAgents.id, agent.id));
    expect(a.runEngine).toBe("claude");
    expect(a.runModel).toBeTruthy();
    expect(claimed.ranOn).toBe(`claude:${a.runModel}`);
  });
});
