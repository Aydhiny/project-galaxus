// @vitest-environment node
//
// Free-model ops against a REAL Postgres (PGlite) with the app's schema and the
// production migration statements (same harness as ops-round3.db.test.ts):
//   * the night shift: while Ajdin sleeps, cloud agents work on free models only
//     (Claude is never queued, even though it's connected), a project's next day
//     is planned early but never twice, and the morning inbox gets one summary;
//   * hourly free-model health checks: quota and resting state refreshed, quota
//     not wasted, 3 failures in a row = "unhealthy" and tried last.
// The clock is faked (Date only) so "night in Sarajevo" is deterministic. The only
// stand-ins are the outside HTTP services: `fetch` answers like they do.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  calls: [] as { url: string; body: string }[],
  reply: (() => ({ status: 200, text: "ok" })) as (url: string, body: string) => { status: number; text: string; headers?: Record<string, string> },
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
// after(): run the work, and let the test wait for it (as Vercel's waitUntil would).
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const day = await import("@/lib/services/ops-day");
const projects = await import("@/lib/services/ops-projects");
const night = await import("@/lib/services/ops-night");
const free = await import("@/lib/services/free-llm");
const health = await import("@/lib/services/free-health");
const tokens = await import("@/lib/services/api-tokens");
const { opsMissions, opsMessages, opsProjects, opsSettings, freeLlmKeys, users, voiceCommands } = schema;

let me = 0, sara = 0;
const mission = async (id: number) => (await testDb.select().from(opsMissions).where(eq(opsMissions.id, id)))[0];
const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string, headers: Record<string, string> = {}) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }), headers });
const llmCalls = () => h.calls.filter((c) => c.url.endsWith("/chat/completions"));
const systemOf = (body: string) => { try { return (JSON.parse(body) as { messages: { content: string }[] }).messages[0].content; } catch { return ""; } };
const planCalls = () => llmCalls().filter((c) => systemOf(c.body).includes("lead of a project")).length;
const claudeJobs = async (userId: number) => testDb.select().from(voiceCommands).where(eq(voiceCommands.userId, userId));
const setNow = (iso: string) => vi.setSystemTime(new Date(iso));

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : "";
  h.calls.push({ url, body });
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url, body);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }
  if (url === "https://mcp.exa.ai/mcp") {
    const text = "Title: Sarajevo cafes\nURL: https://example.com/cafes\nPublished: 2026-10-01T00:00:00Z\nHighlights:\nTen cafes on Ferhadija.";
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  }
  return new Response("not found", { status: 404 });
}

/** A free model that answers like the real thing for each kind of prompt Ops sends. */
function crewModel(_url: string, body: string) {
  const sys = systemOf(body);
  const quota = { "x-ratelimit-remaining-requests": "900", "x-ratelimit-limit-requests": "1000" };
  if (sys.includes("lead of a project")) {
    return llm(JSON.stringify({ plan: "Find cafes, then pitch.", message: "Nova: cafes.", missions: [{ title: `Find cafes ${planCalls()}`, brief: "Name, link", agent: "Nova", role: "researcher", kind: "research", effort: "quick", due_in_days: 0 }], question_for_user: null }), quota);
  }
  if (sys.includes("An agent on your crew just handed in a result")) {
    return llm(JSON.stringify({ verdict: "accept", progress: 100, note: "Good list.", feedback: "Solid, sourced.", next: null }), quota);
  }
  return llm("## Result\n- Cafe Tito [1]\n\n[1] https://example.com/cafes", quota);
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test" }).returning())[0].id;
  sara = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
  vi.useFakeTimers({ toFake: ["Date"] });
}, 120_000);
afterAll(() => { vi.useRealTimers(); });

describe("night shift", () => {
  let nova = 0, claudia = 0, chief = 0, forNova = 0, forClaudia = 0, projectId = 0;

  it("is off by default: off shift at night nothing runs", async () => {
    setNow("2026-10-15T21:30:00Z"); // 23:30 in Sarajevo
    await tokens.createApiTokenFor(me, "Runner", "voice"); // Claude IS connected (the runner)
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_test_1234567890", model: "llama-3.3-70b-versatile" });
    h.reply = crewModel;
    chief = (await ops.createAgentFor(me, { name: "Boss", role: "chief", provider: "claude", cloud: true })).agent.id;
    nova = (await ops.createAgentFor(me, { name: "Nova", role: "researcher", provider: "claude", cloud: true })).agent.id;
    claudia = (await ops.createAgentFor(me, { name: "Claudia", role: "scribe", provider: "claude", cloud: true, engine: "claude" })).agent.id;
    await ops.setDayFor(me, { startsAt: "09:00", endsAt: "17:00" });
    forNova = (await ops.createMissionFor(me, { title: "List cafes in Sarajevo", kind: "research", agentId: nova }) as { id: number }).id;
    forClaudia = (await ops.createMissionFor(me, { title: "Write a cafe pitch", kind: "writing", agentId: claudia }) as { id: number }).id;
    expect(await ops.dispatchCloudFor(me)).toMatchObject({ dispatched: 0, reason: "off shift" });
    expect((await mission(forNova)).status).toBe("open");
    expect(await claudeJobs(me)).toHaveLength(0);
  });

  it("on: free models take the work while you sleep; Claude is never queued, Claude-only agents wait", async () => {
    await night.setNightShiftFor(me, true);
    expect(await night.nightShiftActiveFor(me)).toBe(true);
    await ops.dispatchCloudFor(me);
    expect(await mission(forNova)).toMatchObject({ status: "claimed", jobId: 0, nightShift: true });
    expect((await mission(forClaudia)).status).toBe("open"); // a Claude-only agent sleeps till morning
    await settle();
    const done = await mission(forNova);
    expect(done).toMatchObject({ status: "submitted", spentCents: 0, nightShift: true });
    expect(done.deliverable).toContain("free model (Groq");
    expect(done.chiefNote).toContain("Good list."); // the Chief's review ran too: on a free model
    expect(await claudeJobs(me)).toHaveLength(0); // not one Claude job all night
  });

  it("the lead's thinking at night goes to free models too (a new project's first plan)", async () => {
    const p = await projects.createProjectFor(me, { title: "Cafe clients", goal: "Find 30 Sarajevo cafes that need a website", days: 5, leadAgentId: chief });
    projectId = p.id;
    await settle();
    expect(planCalls()).toBe(1);
    expect((await testDb.select().from(opsProjects).where(eq(opsProjects.id, p.id)))[0].lastPlannedDay).toBe("2026-10-15");
    expect(await claudeJobs(me)).toHaveLength(0);
  });

  it("before UTC midnight the ending day isn't planned again; after it, the next day is planned early, once", async () => {
    await day.opsTickFor(me); // 23:30 local, still the 15th in UTC
    await settle();
    expect(planCalls()).toBe(1);
    expect((await testDb.select().from(opsSettings).where(eq(opsSettings.userId, me)))[0].nightStartedAt).not.toBeNull();

    setNow("2026-10-16T00:30:00Z"); // 02:30 local: UTC is now the day Ajdin wakes into
    await day.opsTickFor(me);
    await settle();
    expect(planCalls()).toBe(2);
    expect((await testDb.select().from(opsProjects).where(eq(opsProjects.id, projectId)))[0].lastPlannedDay).toBe("2026-10-16");
    await day.opsTickFor(me); // another beat: nothing new to plan
    await settle();
    expect(planCalls()).toBe(2);
    expect(await claudeJobs(me)).toHaveLength(0);
  });

  it("in the morning: one summary in the inbox, and the day isn't planned a second time", async () => {
    setNow("2026-10-16T05:30:00Z"); // 07:30 local: awake
    const r = await day.opsTickFor(me);
    await settle();
    expect(r).not.toHaveProperty("night");
    const inbox = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, me), eq(opsMessages.toUser, true)));
    const summary = inbox.filter((m) => m.body.startsWith("Night shift:"));
    expect(summary).toHaveLength(1);
    const doneAtNight = (await testDb.select().from(opsMissions).where(and(eq(opsMissions.userId, me), eq(opsMissions.nightShift, true), eq(opsMissions.status, "submitted")))).length;
    expect(doneAtNight).toBeGreaterThanOrEqual(2); // the list + the planned project missions
    expect(summary[0].body).toContain(`${doneAtNight} missions done on free models`);
    expect(summary[0].fromAgentId).toBe(chief);
    expect((await testDb.select().from(opsSettings).where(eq(opsSettings.userId, me)))[0].nightStartedAt).toBeNull();

    await day.opsTickFor(me); // no second summary
    expect((await testDb.select().from(opsMessages).where(eq(opsMessages.userId, me))).filter((m) => m.body.startsWith("Night shift:"))).toHaveLength(1);

    setNow("2026-10-16T08:00:00Z"); // 10:00 local, the morning is planned already
    await day.opsTickFor(me);
    await settle();
    expect(planCalls()).toBe(2);
  });

  it("the debrief counts the night's work", async () => {
    const md = await day.debriefMarkdown(me, "2026-10-15");
    expect(md).toMatch(/Night shift: \d+ missions? done on free models/);
  });
});

describe("free-model health checks", () => {
  it("refresh quota and resting state, skip resting and nearly-empty providers, and label the requests", async () => {
    setNow("2026-10-16T08:00:00Z");
    await free.saveFreeKeyFor(sara, { provider: "groq", key: "gsk_test_1234567890", model: "llama-3.3-70b-versatile" });
    await free.saveFreeKeyFor(sara, { provider: "gemini", key: "AIza_test_1234567890", model: "gemini-3.6-flash" });
    await free.saveFreeKeyFor(sara, { provider: "openrouter", key: "sk-or-test-1234567890", model: "nvidia/nemotron-3.5-lightning:free" });
    await free.saveFreeKeyFor(sara, { provider: "cerebras", key: "csk-test-1234567890", model: "zai-glm-4.7" });
    const keyOf = async (p: string) => (await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, sara), eq(freeLlmKeys.provider, p))))[0];
    await testDb.update(freeLlmKeys).set({ cooldownUntil: new Date(Date.now() + 3_600_000) }).where(eq(freeLlmKeys.id, (await keyOf("openrouter")).id)); // resting
    await testDb.update(freeLlmKeys).set({ day: "2026-10-16", requests: 97 }).where(eq(freeLlmKeys.id, (await keyOf("cerebras")).id)); // 3 of 100 left
    await testDb.update(freeLlmKeys).set({ priority: 0 }).where(eq(freeLlmKeys.id, (await keyOf("gemini")).id));
    await testDb.update(freeLlmKeys).set({ priority: 1 }).where(eq(freeLlmKeys.id, (await keyOf("groq")).id));
    h.reply = (url) => url.includes("groq")
      ? llm("ok", { "x-ratelimit-remaining-requests": "777", "x-ratelimit-limit-requests": "1000" })
      : { status: 500, text: '{"error":"internal"}' };
    const before = llmCalls().length;

    const r = await health.healthCheckFor(sara);
    expect(r.checked).toBe(2);
    expect(r.providers).toMatchObject({ openrouter: "skipped: resting", cerebras: "skipped: low quota", groq: "ok", gemini: "failed (1 in a row)" });
    const sent = llmCalls().slice(before);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0].body)).toMatchObject({ max_tokens: 300 }); // room for reasoning models

    const groq = await keyOf("groq");
    expect(groq).toMatchObject({ requests: 1, healthChecks: 1, healthFails: 0, remainingRequests: 777, lastError: null });
    expect(groq.lastOkAt).not.toBeNull();
    const gem = await keyOf("gemini");
    expect(gem).toMatchObject({ healthFails: 1, healthChecks: 1 });
    expect(gem.lastError).toContain("HTTP 500");
    expect(gem.cooldownUntil!.getTime()).toBeGreaterThan(Date.now()); // resting, so missions skip it now

    // Shown in the dialog: exact quota, and the health checks labelled within today's usage.
    const st = await free.freeStatusFor(sara);
    const g = st.providers.find((p) => p.provider === "groq")!;
    expect(g.left).toMatchObject({ requests: 777, exact: true, used: 1 });
    expect(g.healthChecksToday).toBe(1);

    // Within the hour: nothing is checked again.
    expect((await health.healthCheckFor(sara)).checked).toBe(0);
  });

  it("three failures in a row: unhealthy, with its last error, and tried last until it passes again", async () => {
    const keyOf = async (p: string) => (await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, sara), eq(freeLlmKeys.provider, p))))[0];
    setNow("2026-10-16T09:01:00Z");
    await health.healthCheckFor(sara);
    setNow("2026-10-16T10:02:00Z");
    const r = await health.healthCheckFor(sara);
    expect(r.providers.gemini).toBe("failed (3 in a row)");
    const st = await free.freeStatusFor(sara);
    const gem = st.providers.find((p) => p.provider === "gemini")!;
    expect(gem).toMatchObject({ unhealthy: true, healthFails: 3 });
    expect(gem.lastError).toContain("HTTP 500");

    // Its rest is over, it's your first choice by priority, and still the router tries it LAST.
    setNow("2026-10-16T10:30:00Z");
    h.reply = (url) => url.includes("groq") ? llm("from groq") : llm("from gemini");
    expect((await free.askFree(sara, { system: "s", prompt: "p" })).provider).toBe("groq");

    // It passes the next check: healthy again, back to its place.
    setNow("2026-10-16T11:03:00Z");
    expect((await health.healthCheckFor(sara)).providers.gemini).toBe("ok");
    expect(await keyOf("gemini")).toMatchObject({ healthFails: 0, lastError: null });
    expect((await free.askFree(sara, { system: "s", prompt: "p" })).provider).toBe("gemini");
  });
});
