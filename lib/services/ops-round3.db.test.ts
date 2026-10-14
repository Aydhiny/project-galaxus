// @vitest-environment node
//
// Round 3 against a REAL Postgres (PGlite) with the app's schema and the production
// migration statements: free models taking over when Claude can't (and failing over
// between providers), agents asking you questions and resuming on your answer,
// shared memory captured and searched, the lead's planning on free models, projects
// planned through the real runner queue, and work requests between two facilities.
// The only stand-ins are the outside HTTP services (free LLM provider, Exa, a web
// page): tests have no network, so `fetch` answers like those services do.

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
  calls: [] as { url: string; body: string }[],
  reply: (() => ({ status: 200, text: "ok" })) as (url: string) => { status: number; text: string; headers?: Record<string, string> },
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
// after(): run the work, and let the test wait for it (as Vercel's waitUntil would).
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const day = await import("@/lib/services/ops-day");
const inbox = await import("@/lib/services/ops-inbox");
const projects = await import("@/lib/services/ops-projects");
const links = await import("@/lib/services/ops-links");
const free = await import("@/lib/services/free-llm");
const mem = await import("@/lib/services/ops-memory");
const tokens = await import("@/lib/services/api-tokens");
const voice = await import("@/lib/services/voice");
const { opsMissions, opsMessages, opsAgents, opsMemories, freeLlmKeys, users, monthlyGoals, voiceCommands } = schema;

let me = 0, sara = 0, faruk = 0;
const today = () => new Date().toISOString().slice(0, 10);
const mission = async (id: number) => (await testDb.select().from(opsMissions).where(eq(opsMissions.id, id)))[0];
const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string, headers: Record<string, string> = {}) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 420 } }), headers });
const llmCalls = () => h.calls.filter((c) => c.url.endsWith("/chat/completions"));

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : "";
  h.calls.push({ url, body });
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }
  if (url === "https://mcp.exa.ai/mcp") {
    const text = "Title: Where Bosnian designers find logo gigs\nURL: https://example.com/logo-gigs\nPublished: 2026-10-01T00:00:00Z\nHighlights:\nr/forhire and Fiverr are the usual starts.";
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  }
  if (url === "https://example.com/logo-gigs") {
    return new Response(`<html><body><h1>Logo gigs</h1><p>${"Post a portfolio on r/forhire with prices in EUR. ".repeat(8)}</p></body></html>`, { headers: { "content-type": "text/html" } });
  }
  return new Response("not found", { status: 404 });
}

/** The runner's side of one queued job (exactly what voice.yml does). */
async function runJob(userId: number, answer: string, costCents: number | null) {
  const job = await voice.claimNextFor(userId);
  if (!job) throw new Error("no job queued");
  await voice.completeFor(userId, job.id, { ok: true, summary: answer, costCents });
  return job;
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test" }).returning())[0].id;
  sara = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;
  faruk = (await testDb.insert(users).values({ name: "Faruk", email: "faruk@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("free models", () => {
  it("take a cloud mission when Claude isn't available: Reach researches, memory briefs, the free model writes", async () => {
    // Ajdin has no Claude connected, but a free Groq key.
    await testDb.insert(monthlyGoals).values({ userId: me, title: "Earn 500 KM from design gigs", month: today().slice(0, 7) });
    await mem.refreshAboutMe(me);
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_test_1234567890", model: "llama-3.3-70b-versatile" });
    h.reply = () => llm("## Logo gigs\n- Post on r/forhire [1]\n\n[1] https://example.com/logo-gigs", { "x-ratelimit-remaining-requests": "742", "x-ratelimit-limit-requests": "1000" });

    const { agent } = await ops.createAgentFor(me, { name: "Nova", role: "researcher", provider: "claude", cloud: true });
    expect(agent.engine).toBe("auto");
    const m = await ops.createMissionFor(me, { title: "Find logo design gigs", kind: "research", agentId: agent.id }) as { id: number };
    expect(await mission(m.id)).toMatchObject({ status: "claimed", jobId: 0 }); // on a free model, no runner job
    await settle();

    const done = await mission(m.id);
    expect(done).toMatchObject({ status: "submitted", spentCents: 0, submittedBy: agent.id });
    expect(done.deliverable).toContain("Post on r/forhire");
    expect(done.deliverable).toContain("free model (Groq · llama-3.3-70b-versatile)");
    // What the model was given: the mission, the web sources Reach found and read, and what we know about Ajdin.
    const sent = JSON.parse(llmCalls().at(-1)!.body) as { model: string; messages: { content: string }[] };
    expect(sent.model).toBe("llama-3.3-70b-versatile");
    expect(sent.messages[1].content).toContain("MISSION: Find logo design gigs");
    expect(sent.messages[1].content).toContain("Post a portfolio on r/forhire"); // the page itself, read in full
    expect(sent.messages[1].content).toContain("Earn 500 KM from design gigs"); // shared memory
    // The quota shown in the UI is the provider's own number.
    const st = await free.freeStatusFor(me);
    expect(st).toMatchObject({ usableCount: 1, requestsLeftToday: 742 });
    expect(st.providers[0].left).toMatchObject({ requests: 742, exact: true });
  });

  it("switch to the next provider when one runs out, and rest the empty one", async () => {
    await free.saveFreeKeyFor(me, { provider: "gemini", key: "AIza_test_1234567890", model: "gemini-3.6-flash" });
    h.reply = (url) => url.includes("groq") ? { status: 429, text: "Rate limit reached: requests per day (RPD)" } : llm("ok from gemini");
    const r = await free.askFree(me, { system: "s", prompt: "p" });
    expect(r).toMatchObject({ provider: "gemini", text: "ok from gemini" });
    const [groq] = await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, me), eq(freeLlmKeys.provider, "groq")));
    expect(groq.cooldownUntil!.getTime()).toBeGreaterThan(Date.now() + 3_600_000); // a daily limit rests for hours
    expect((await free.freeStatusFor(me)).usableCount).toBe(1);
    await testDb.update(freeLlmKeys).set({ cooldownUntil: null }).where(eq(freeLlmKeys.id, groq.id));
  });

  it("a missing or overloaded model doesn't sink the provider: it tries its other models and keeps the one that works", async () => {
    const [g] = await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, me), eq(freeLlmKeys.provider, "gemini")));
    await testDb.update(freeLlmKeys).set({ model: "gemini-3.6-flash", priority: 0 }).where(eq(freeLlmKeys.id, g.id));
    await testDb.update(freeLlmKeys).set({ priority: 1 }).where(and(eq(freeLlmKeys.userId, me), eq(freeLlmKeys.provider, "groq")));
    h.reply = (url) => url.includes("generativelanguage") ? { status: 503, text: '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}' } : llm("groq");
    // Busy is per model: the request body says which one was asked.
    const models: string[] = [];
    const orig = h.reply;
    h.reply = (url) => { const body = JSON.parse(h.calls.at(-1)!.body) as { model: string }; models.push(body.model); return body.model === "gemini-3.8-flash" ? llm("from 3.8") : orig(url); };
    const r = await free.askFree(me, { system: "s", prompt: "p" });
    expect(r).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash", text: "from 3.8" });
    expect(models).toEqual(["gemini-3.6-flash", "gemini-3.8-flash"]);
    // Busy is temporary: your chosen model stays.
    expect((await testDb.select().from(freeLlmKeys).where(eq(freeLlmKeys.id, g.id)))[0].model).toBe("gemini-3.6-flash");

    // Groq says your model doesn't exist for this key; it lists what does; the working one is saved.
    await testDb.update(freeLlmKeys).set({ priority: 5 }).where(eq(freeLlmKeys.id, g.id));
    await testDb.update(freeLlmKeys).set({ model: "llama-3.3-70b-versatile", cooldownUntil: null }).where(and(eq(freeLlmKeys.userId, me), eq(freeLlmKeys.provider, "groq")));
    h.reply = () => {
      const body = JSON.parse(h.calls.at(-1)!.body) as { model: string };
      return body.model === "openai/gpt-oss-120b" ? llm("from gpt-oss") : { status: 404, text: '{"error":{"code":"model_not_found"}}' };
    };
    const r2 = await free.askFree(me, { system: "s", prompt: "p" });
    expect(r2).toMatchObject({ provider: "groq", model: "openai/gpt-oss-120b" });
    expect((await testDb.select().from(freeLlmKeys).where(and(eq(freeLlmKeys.userId, me), eq(freeLlmKeys.provider, "groq"))))[0]).toMatchObject({ model: "openai/gpt-oss-120b", cooldownUntil: null });
    await testDb.update(freeLlmKeys).set({ model: "llama-3.3-70b-versatile", priority: 0 }).where(and(eq(freeLlmKeys.userId, me), eq(freeLlmKeys.provider, "groq")));
    await testDb.update(freeLlmKeys).set({ priority: 1 }).where(eq(freeLlmKeys.id, g.id));
  });

  it("a free-model agent can ask you; your answer is remembered and the mission resumes", async () => {
    const nova = (await testDb.select().from(opsAgents).where(and(eq(opsAgents.userId, me), eq(opsAgents.name, "Nova"))))[0];
    h.reply = () => llm("QUESTION: Logos only, or also social media templates?\nOPTIONS: Logos only | Both");
    const m = await ops.createMissionFor(me, { title: "Price my design services", kind: "research", agentId: nova.id }) as { id: number };
    // Nova's previous mission is submitted (not claimed), so it's free to take this one.
    await settle();
    const waiting = await mission(m.id);
    expect(waiting).toMatchObject({ status: "open", agentId: nova.id });
    expect(waiting.waitingOn).not.toBeNull();
    const q = (await inbox.inboxFor(me)).find((x) => x.kind === "question" && x.missionId === m.id)!;
    expect(q).toMatchObject({ body: "Logos only, or also social media templates?", options: ["Logos only", "Both"], agent: "Nova" });

    h.reply = () => llm("## Prices\n- Logo: 60–120 KM");
    expect(await inbox.answerFor(me, q.id, "Logos only")).toEqual({ resumed: 1 });
    await settle();
    const resumed = await mission(m.id);
    expect(resumed.status).toBe("submitted");
    expect(resumed.brief).toContain("The user answered: Logos only");
    // Every agent can find that decision now.
    const hits = await mem.memSearch(me, "social media templates");
    expect(hits[0]).toMatchObject({ type: "decision", title: "Logos only, or also social media templates?" });
  });
});

describe("shared memory", () => {
  it("captures accepted results and searches in 3 steps (index → timeline → full text)", async () => {
    const [m] = await testDb.select().from(opsMissions).where(and(eq(opsMissions.userId, me), eq(opsMissions.title, "Find logo design gigs")));
    await ops.acceptMissionFor(me, m.id);
    const idx = await mem.memSearch(me, "forhire logo");
    const finding = idx.find((x) => x.type === "finding")!;
    expect(finding.title).toBe("Find logo design gigs");
    const around = await mem.memTimeline(me, { aroundId: finding.id });
    expect(around.some((x) => "anchor" in x && x.id === finding.id)).toBe(true);
    const [full] = await mem.memGet(me, [finding.id]);
    expect(full.body).toContain("Post on r/forhire");
    // Pinned "about" is in every brief; a search hit is added when it's relevant.
    const brief = await mem.memoryBrief(me, "logo gigs");
    expect(brief).toContain("[about]");
    expect(brief).toContain("Find logo design gigs");
    // Another user's memories never leak.
    expect(await mem.memSearch(sara, "logo")).toEqual([]);
    expect(await mem.memGet(sara, [finding.id])).toEqual([]);
  });

  it("check-ins give local agents the memory brief", async () => {
    const { agent } = await ops.createAgentFor(me, { name: "Kodi", role: "builder", provider: "codex" });
    const c = await ops.checkinForAgent(agent);
    expect(c.memory).toContain("About the user");
  });
});

describe("Claude's budget and free fallback", () => {
  it("logs off when today's Claude share is used and nothing free is set up; free models take over once added", async () => {
    await tokens.createApiTokenFor(sara, "Runner", "voice"); // Claude connected via the runner
    await inbox.saveOpsSettingsFor(sara, { monthlyBudgetUsd: 0 });
    const { agent: lyra } = await ops.createAgentFor(sara, { name: "Lyra", role: "researcher", provider: "claude", cloud: true });
    const { agent: strict } = await ops.createAgentFor(sara, { name: "Strict", role: "scribe", provider: "claude", cloud: true, engine: "claude" });
    const m = await ops.createMissionFor(sara, { title: "Summarise Upwork's new fee rules", kind: "research", agentId: lyra.id }) as { id: number };
    const w = await ops.createMissionFor(sara, { title: "Write a cover letter", kind: "other", agentId: strict.id }) as { id: number };
    expect((await mission(m.id)).status).toBe("open");
    expect(await ops.dispatchCloudFor(sara)).toMatchObject({ dispatched: 0, reason: "today's budget is used up" });

    await free.saveFreeKeyFor(sara, { provider: "groq", key: "gsk_sara_1234567890", model: "llama-3.3-70b-versatile" });
    h.reply = () => llm("## Upwork fees\n- 10% flat");
    const r = await ops.dispatchCloudFor(sara);
    expect(r).toMatchObject({ dispatched: 1, reason: "today's budget is used up — free models are covering" });
    await settle();
    expect(await mission(m.id)).toMatchObject({ status: "submitted", spentCents: 0 });
    expect((await mission(w.id)).status).toBe("open"); // "Claude only" waits for Claude
    expect(await testDb.select().from(voiceCommands).where(eq(voiceCommands.userId, sara))).toEqual([]); // not one Claude run
  });

  it("with budget left: quick missions go free first, normal ones go to Claude", async () => {
    await inbox.saveOpsSettingsFor(sara, { monthlyBudgetUsd: 15 });
    await testDb.update(opsMissions).set({ status: "cancelled" }).where(and(eq(opsMissions.userId, sara), eq(opsMissions.status, "open")));
    const lyra = (await testDb.select().from(opsAgents).where(and(eq(opsAgents.userId, sara), eq(opsAgents.name, "Lyra"))))[0];
    h.reply = () => llm("- quick answer");
    const q = await ops.createMissionFor(sara, { title: "List 5 freelance sites", kind: "research", agentId: lyra.id, effort: "quick" }) as { id: number };
    expect((await mission(q.id)).jobId).toBe(0);
    await settle();
    const n = await ops.createMissionFor(sara, { title: "Deeper market scan", kind: "research", agentId: lyra.id, effort: "normal" }) as { id: number };
    const claimed = await mission(n.id);
    expect(claimed.status).toBe("claimed");
    expect(claimed.jobId).toBeGreaterThan(0); // a real runner job
    await runJob(sara, "## Market\n- ok", 21);
    expect(await mission(n.id)).toMatchObject({ status: "submitted", spentCents: 21, costMeasured: true });
  });

  it("the Chief plans the stand-up on a free model when Claude's share is used", async () => {
    await inbox.saveOpsSettingsFor(sara, { monthlyBudgetUsd: 0 });
    await ops.createAgentFor(sara, { name: "Chief Sara", role: "chief", provider: "claude", cloud: true, engine: "auto" });
    h.reply = () => llm('{"message":"Today: fees, then outreach.","missions":[{"title":"Collect 10 client leads in Sarajevo","kind":"research","role":"researcher","budget_usd":0}]}');
    const before = llmCalls().length;
    expect(await day.standupFor(sara, { manual: true })).toMatchObject({ done: true, planned: true });
    await settle();
    expect(llmCalls().length).toBeGreaterThan(before);
    const added = await testDb.select().from(opsMissions).where(and(eq(opsMissions.userId, sara), eq(opsMissions.title, "Collect 10 client leads in Sarajevo")));
    expect(added).toHaveLength(1);
    const msgs = await testDb.select().from(opsMessages).where(eq(opsMessages.userId, sara));
    expect(msgs.some((x) => x.body === "Today: fees, then outreach.")).toBe(true);
  });
});

describe("projects and work requests", () => {
  it("a project with a cloud lead is planned through the runner, and its goal is remembered", async () => {
    await tokens.createApiTokenFor(faruk, "Runner", "voice");
    const { agent: lead } = await ops.createAgentFor(faruk, { name: "Boss", role: "chief", provider: "claude", cloud: true });
    const p = await projects.createProjectFor(faruk, { title: "First 3 paying clients", goal: "Land 3 paying web design clients in Sarajevo", days: 14, leadAgentId: lead.id });
    const job = await runJob(faruk, JSON.stringify({
      plan: "Week 1: leads. Week 2: pitches.", message: "Start with leads.",
      missions: [{ title: "Find 20 local businesses without websites", brief: "Name, link, why", role: "researcher", kind: "research", effort: "quick", due_in_days: 1 }],
      question_for_user: null,
    }), 9);
    expect((await testDb.select().from(voiceCommands).where(eq(voiceCommands.id, job.id)))[0].kind).toBe("ops_project_day");
    const ms = await testDb.select().from(opsMissions).where(eq(opsMissions.projectId, p.id));
    expect(ms.map((x) => x.title)).toContain("Find 20 local businesses without websites");
    const goal = (await testDb.select().from(opsMemories).where(and(eq(opsMemories.userId, faruk), eq(opsMemories.source, `project:${p.id}`))))[0];
    expect(goal).toMatchObject({ type: "goal", pinned: true, body: "Land 3 paying web design clients in Sarajevo" });
  });

  it("asks a linked facility for work: it waits for them to accept", async () => {
    await links.inviteLinkFor(me, "faruk@example.test", true);
    const invite = (await links.linksFor(faruk)).find((l) => l.status === "pending")!;
    await links.respondLinkFor(faruk, invite.id, true, false);
    const linkId = (await links.linksFor(me)).find((l) => l.status === "active")!.id;
    const r = await ops.createMissionFor(me, { title: "Review my portfolio site", kind: "research", partnerLinkId: linkId, dueInDays: "3" }) as { id: number };
    expect((await mission(r.id)).title).toBe("At Faruk's: Review my portfolio site");
    const theirs = (await testDb.select().from(opsMissions).where(and(eq(opsMissions.userId, faruk), eq(opsMissions.status, "requested"))))[0];
    expect(theirs).toMatchObject({ title: "Review my portfolio site", requestFromLabel: "Ajdin", dueDay: (await mission(r.id)).dueDay });
    await links.respondRequestFor(faruk, theirs.id, true);
    expect((await mission(theirs.id)).status).toBe("open");
  });
});
