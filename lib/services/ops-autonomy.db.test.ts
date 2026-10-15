// @vitest-environment node
//
// Full autonomy against a REAL Postgres (PGlite) with the app's schema and the production
// migration statements: an agent's blocking question is decided by the Chief on a free
// model and the mission resumes; a "send/buy" question still reaches you; the one-a-day
// cap holds; with no model at all the fixed rule decides; and you can change a decision.
// The only stand-ins are the outside HTTP services (the free LLM provider, Exa, a page).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
vi.setConfig({ testTimeout: 60_000 });
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
const inbox = await import("@/lib/services/ops-inbox");
const free = await import("@/lib/services/free-llm");
const autonomy = await import("@/lib/services/ops-autonomy");
const day = await import("@/lib/services/ops-day");
const { opsMissions, opsMessages, opsAgents, opsMemories, users } = schema;

let ines = 0, omar = 0;
const today = () => new Date().toISOString().slice(0, 10);
const mission = async (id: number) => (await testDb.select().from(opsMissions).where(eq(opsMissions.id, id)))[0];
const message = async (id: number) => (await testDb.select().from(opsMessages).where(eq(opsMessages.id, id)))[0];
const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 300 } }), headers: {} });
const llmCalls = () => h.calls.filter((c) => c.url.endsWith("/chat/completions"));
const lastSystem = () => (JSON.parse(llmCalls().at(-1)!.body) as { messages: { content: string }[] }).messages;

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : "";
  h.calls.push({ url, body });
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }
  if (url === "https://mcp.exa.ai/mcp") {
    const text = "Title: Logo prices in Bosnia\nURL: https://example.com/prices\nHighlights:\nLogos cost 60-120 KM.";
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  }
  if (url === "https://example.com/prices") return new Response(`<html><body><p>${"Logos in Sarajevo cost 60 to 120 KM. ".repeat(8)}</p></body></html>`, { headers: { "content-type": "text/html" } });
  return new Response("not found", { status: 404 });
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  ines = (await testDb.insert(users).values({ name: "Ines", email: "ines@example.test" }).returning())[0].id;
  omar = (await testDb.insert(users).values({ name: "Omar", email: "omar@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("full autonomy: the Chief decides", () => {
  let questionId = 0, missionId = 0;

  it("is on by default; an agent's blocking question is decided by the Chief on a free model, and the mission resumes", async () => {
    expect((await inbox.budgetFor(ines)).autonomy).toBe("full");
    await free.saveFreeKeyFor(ines, { provider: "groq", key: "gsk_ines_1234567890", model: "llama-3.3-70b-versatile" });
    const { agent: chief } = await ops.createAgentFor(ines, { name: "Chief", role: "chief", provider: "claude", cloud: true, engine: "free" });
    const { agent: nova } = await ops.createAgentFor(ines, { name: "Nova", role: "researcher", provider: "claude", cloud: true, engine: "free" });
    // The free model plays every part, told apart by the system prompt.
    let runs = 0;
    h.reply = () => {
      const sys = lastSystem()[0].content;
      if (sys.includes("An agent asked a question")) return llm('{"answer":"Both","why":"Templates sell well with logos."}');
      if (sys.startsWith("You are the Chief of staff at Galaxus Ops. An agent")) return llm(JSON.stringify({ verdict: "accept", progress: 100, note: "Prices with sources.", feedback: "Good." }));
      return llm(runs++ === 0 ? "QUESTION: Logos only, or also social media templates?\nOPTIONS: Logos only | Both" : "## Prices\n- Logo: 60–120 KM [1]\n\n[1] https://example.com/prices");
    };
    const m = await ops.createMissionFor(ines, { title: "Price my design services", kind: "research", agentId: nova.id }) as { id: number };
    missionId = m.id;
    await settle();

    const [q] = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, ines), eq(opsMessages.kind, "question")));
    questionId = q.id;
    expect(q).toMatchObject({ route: "chief", answer: "Both", chiefAnswer: "Both", fromAgentId: nova.id, missionId: m.id });
    expect(q.answeredAt).not.toBeNull();
    // The Chief was asked with the mission and the options.
    const decideCall = llmCalls().map((c) => JSON.parse(c.body) as { messages: { content: string }[] }).find((b) => b.messages[0].content.includes("An agent asked a question"))!;
    expect(decideCall.messages[1].content).toContain("MISSION: Price my design services");
    expect(decideCall.messages[1].content).toContain('OPTIONS: "Logos only" | "Both"');
    // The mission resumed with the decision in its brief, exactly like your own answer, and was delivered.
    const done = await mission(m.id);
    expect(done.waitingOn).toBeNull();
    expect(done.brief).toContain("You asked: Logos only, or also social media templates?\nThe Chief answered for the user: Both");
    expect(["submitted", "done"]).toContain(done.status);
    expect(done.deliverable).toContain("60–120 KM");
    // Chief → Nova on the radio, remembered as a decision, and in the Inbox as "decided by the Chief".
    const radio = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, ines), eq(opsMessages.fromAgentId, chief.id), eq(opsMessages.toAgentId, nova.id)));
    expect(radio.map((r) => r.body)).toContain('Decided for the user on "Logos only, or also social media templates?": Both (Templates sell well with logos.)');
    const [memory] = await testDb.select().from(opsMemories).where(and(eq(opsMemories.userId, ines), eq(opsMemories.source, `chief-decided:${q.id}`)));
    expect(memory).toMatchObject({ type: "decision" });
    expect(memory.body).toContain("The Chief decided for you: Both");
    const item = (await inbox.inboxFor(ines)).find((x) => x.id === q.id)!;
    expect(item).toMatchObject({ route: "chief", chiefAnswer: "Both", changedAt: null });
    // Nova never sat "waiting" (that status would have buzzed your phone).
    const novaNow = (await testDb.select().from(opsAgents).where(eq(opsAgents.id, nova.id)))[0];
    expect(novaNow.status).not.toBe("waiting");
  });

  it("send/buy questions still reach you; one a day pushes, the rest wait quietly; ordinary ones still go to the Chief", async () => {
    const nova = (await testDb.select().from(opsAgents).where(and(eq(opsAgents.userId, ines), eq(opsAgents.name, "Nova"))))[0];
    const [m] = await testDb.insert(opsMissions).values({ userId: ines, day: today(), title: "Offer for Zubić Vila", kind: "outreach", agentId: nova.id }).returning();
    const before = llmCalls().length;
    const send = await inbox.askUserForAgent(nova, { question: "Should I send the offer to the dentist now?", options: ["Send it", "Not yet"], missionId: m.id, blocking: true });
    await settle();
    expect(await message(send.id)).toMatchObject({ route: "user", answeredAt: null });
    expect((await mission(m.id)).waitingOn).toBe(send.id);
    expect(llmCalls().length).toBe(before); // the Chief never touched it

    // Today's question went out: the next "buy" waits in Needs you without a push; an urgent one still gets through.
    const buy = await inbox.askUserForAgent(nova, { question: "Should I buy the domain zubicvila.ba for 30 KM?", options: ["Buy it", "Skip"] });
    const urgent = await inbox.askUserForAgent(nova, { question: "The client wants me to sign the contract today: sign it?", options: ["Sign", "Wait"], urgent: true });
    const ordinary = await inbox.askUserForAgent(nova, { question: "Table or bullet list for the price comparison?", options: ["Table", "Bullet list"] });
    h.reply = () => llm('{"answer":"Table","why":"Easier to compare."}');
    await settle();
    expect(await message(buy.id)).toMatchObject({ route: "held", answeredAt: null });
    expect(await message(urgent.id)).toMatchObject({ route: "user", answeredAt: null });
    expect(await message(ordinary.id)).toMatchObject({ route: "chief", answer: "Table" });
    // Reply watch (sending to a real client) always asks you.
    const reply = await inbox.askUserForAgent(nova, { question: "Use this reply for the lead?", options: ["Use this reply", "Not now"], toUser: true });
    expect(await message(reply.id)).toMatchObject({ route: null });

    // Needs you, in the Inbox and the digest.
    const items = await inbox.inboxFor(ines);
    expect(items.filter((i) => i.kind === "question" && !i.answeredAt && i.route !== "chief").map((i) => i.id).sort()).toEqual([send.id, buy.id, urgent.id, reply.id].sort());
    const digest = await autonomy.decisionsDigestFor(ines);
    expect(digest).toMatchObject({ decided: 2, needsYou: 4, line: "The Chief made 2 decisions today, 4 need you." });
    expect(await day.debriefMarkdown(ines, today())).toContain("## Decided for you\n\nThe Chief made 2 decisions today, 4 need you.");

    // Answering a held question works like any other.
    expect(await inbox.answerFor(ines, buy.id, "Skip")).toEqual({ resumed: 0 });
  });

  it("Change: your answer replaces the Chief's, the agent hears it, and a mission that moved on is redone with it", async () => {
    const nova = (await testDb.select().from(opsAgents).where(and(eq(opsAgents.userId, ines), eq(opsAgents.name, "Nova"))))[0];
    h.reply = () => {
      const sys = lastSystem()[0].content;
      if (sys.startsWith("You are the Chief of staff at Galaxus Ops. An agent")) return llm(JSON.stringify({ verdict: "accept", progress: 100, note: "Logos only.", feedback: "Good." }));
      return llm("## Logo prices only\n- 60–120 KM");
    };
    await testDb.update(opsAgents).set({ status: "idle" }).where(eq(opsAgents.id, nova.id));
    // Nova must be free to take it again: the other test missions are out of the way.
    await testDb.update(opsMissions).set({ status: "cancelled", waitingOn: null }).where(and(eq(opsMissions.userId, ines), eq(opsMissions.title, "Offer for Zubić Vila")));
    const r = await autonomy.changeDecisionFor(ines, questionId, "Logos only");
    expect(r).toEqual({ changed: true, reopened: true });
    await settle();
    const q = await message(questionId);
    expect(q).toMatchObject({ answer: "Logos only", chiefAnswer: "Both" });
    expect(q.changedAt).not.toBeNull();
    const redone = await mission(missionId);
    expect(redone.brief).toContain('Correction from the user (replaces the Chief\'s answer "Both"):\nYou asked: Logos only, or also social media templates?\nThe user answered: Logos only');
    expect(["submitted", "done"]).toContain(redone.status);
    expect(redone.deliverable).toContain("Logo prices only");
    const radio = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, ines), eq(opsMessages.toAgentId, nova.id)));
    expect(radio.map((x) => x.body)).toContain('Correction to "Logos only, or also social media templates?": the user\'s answer is Logos only (not Both).');
    const [memory] = await testDb.select().from(opsMemories).where(and(eq(opsMemories.userId, ines), eq(opsMemories.source, `chief-decided:${questionId}`)));
    expect(memory.body).toContain("You changed it to: Logos only");
    // Only the Chief's decisions can be changed this way.
    const yours = (await inbox.inboxFor(ines)).find((i) => i.route === "user")!;
    await expect(autonomy.changeDecisionFor(ines, yours.id, "Not yet")).rejects.toThrow(/Only a decision the Chief already made/);
    // Changing to "Leave it" on a delivered mission doesn't undo the delivery.
    await autonomy.changeDecisionFor(ines, questionId, "Leave it");
    expect(["submitted", "done"]).toContain((await mission(missionId)).status);
  });
});

describe("with no model at all, the rule decides (Galaxus is the Chief)", () => {
  it("try again once, then leave it; which city → Sarajevo", async () => {
    const { agent: scout } = await ops.createAgentFor(omar, { name: "Testy", role: "scout", provider: "claude", cloud: true, engine: "free" });
    const [m] = await testDb.insert(opsMissions).values({ userId: omar, day: today(), title: "Dentists in Mostar", kind: "research", agentId: scout.id, brief: "FIND: dentist @ Mostar" }).returning();
    const ask = () => inbox.askUserForAgent(scout, { question: `I couldn't finish "${m.title}" (2 tries). Should I try again?`, options: ["Try again", "Leave it"], missionId: m.id, blocking: true });

    const first = await ask();
    await settle();
    expect(await message(first.id)).toMatchObject({ route: "chief", answer: "Try again" });
    expect(await mission(m.id)).toMatchObject({ waitingOn: null, status: "open" });
    expect((await mission(m.id)).brief).toContain("The Chief answered for the user: Try again");
    // No Chief agent: Galaxus itself told the scout.
    const radio = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, omar), eq(opsMessages.toAgentId, scout.id)));
    expect(radio[0]).toMatchObject({ fromAgentId: null });

    const second = await ask();
    await settle();
    expect(await message(second.id)).toMatchObject({ answer: "Leave it" });
    expect((await mission(m.id)).status).toBe("cancelled");

    // "Which city?" goes through the planner-job path (no Claude, no free model) and lands on the rule.
    const [f] = await testDb.insert(opsMissions).values({ userId: omar, day: today(), title: "Lawyers", kind: "research", agentId: scout.id, brief: "FIND: lawyer @ Banjja Lukka" }).returning();
    const city = await inbox.askUserForAgent(scout, { question: `Which city should "Lawyers" search? The map couldn't find "Banjja Lukka".`, options: ["Sarajevo", "Banja Luka", "Mostar", "Tuzla"], missionId: f.id, blocking: true });
    await settle();
    expect(await message(city.id)).toMatchObject({ answer: "Sarajevo" });
    const { parseFindLine } = await import("@/lib/services/business-finder");
    expect(parseFindLine((await mission(f.id)).brief)).toEqual({ type: "lawyer", city: "Sarajevo" });
  });

  it("ask mode sends every question to you", async () => {
    await inbox.saveOpsSettingsFor(omar, { autonomy: "ask" });
    const scout = (await testDb.select().from(opsAgents).where(eq(opsAgents.userId, omar)))[0];
    const q = await inbox.askUserForAgent(scout, { question: "Table or bullet list?", options: ["Table", "List"] });
    await settle();
    expect(await message(q.id)).toMatchObject({ route: null, answeredAt: null });
    await expect(inbox.saveOpsSettingsFor(omar, { autonomy: "sometimes" })).rejects.toThrow();
  });

  it("a question the Chief never got to is decided on the next beat", async () => {
    await inbox.saveOpsSettingsFor(omar, { autonomy: "full" });
    const scout = (await testDb.select().from(opsAgents).where(eq(opsAgents.userId, omar)))[0];
    const [stuck] = await testDb.insert(opsMessages).values({
      userId: omar, fromAgentId: scout.id, toUser: true, kind: "question", route: "chief", options: ["Table", "List"], body: "Table or list?", at: new Date(Date.now() - 20 * 60_000),
    }).returning();
    expect(await autonomy.healChiefQuestionsFor(omar)).toBe(1);
    expect(await message(stuck.id)).toMatchObject({ answer: "Table", chiefAnswer: "Table" });
  });
});
