// @vitest-environment node
//
// "See & steer" against a REAL Postgres (PGlite) with the app's schema and the
// production migration statements: your directions to the Chief reach the very
// next plan prompts (project day and stand-up) and come back acknowledged on the
// radio; a day's floor history loads for the replay (yours only) and rebuilds
// into the presence the live view showed. The only stand-in is the free LLM
// provider's HTTP API: tests have no network, so `fetch` answers like it does.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
const client = new PGlite();
const testDb = drizzle(client, { schema });
const h = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  calls: [] as { url: string; body: string }[],
  reply: (() => ({ status: 200, text: "ok" })) as (url: string) => { status: number; text: string },
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
// after(): run the work, and let the test wait for it (as Vercel's waitUntil would).
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const day = await import("@/lib/services/ops-day");
const projects = await import("@/lib/services/ops-projects");
const directions = await import("@/lib/services/ops-directions");
const mem = await import("@/lib/services/ops-memory");
const free = await import("@/lib/services/free-llm");
const replay = await import("@/lib/services/ops-replay");
const { agentsAt, missionsAt, replayDays } = await import("@/lib/ops-replay");
const { opsAgents, opsEvents, opsMessages, opsMemories, opsProjects, users } = schema;

let me = 0, other = 0;
const today = () => new Date().toISOString().slice(0, 10);
const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }) });

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  h.calls.push({ url, body: typeof init?.body === "string" ? init.body : "" });
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json" } });
  }
  return new Response("not found", { status: 404 });
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test" }).returning())[0].id;
  other = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("talk to the Chief", () => {
  let chief = 0, project = 0;

  it("a direction becomes a pinned memory, a radio message to the Chief, and a plain 'Noted' when no free model can answer", async () => {
    chief = (await ops.createAgentFor(me, { name: "Atlas", role: "chief", provider: "claude", cloud: true })).agent.id;
    const r = await directions.addDirectionFor(me, "Focus on lawyers in Mostar tomorrow, skip dentists with good sites.");
    expect(r.chief).toBe("Atlas");
    await settle();

    const [m] = await testDb.select().from(opsMemories).where(eq(opsMemories.id, r.id));
    expect(m).toMatchObject({ type: "direction", pinned: true, body: "Focus on lawyers in Mostar tomorrow, skip dentists with good sites." });
    const radio = await testDb.select().from(opsMessages).where(eq(opsMessages.userId, me)).orderBy(opsMessages.id);
    expect(radio[0]).toMatchObject({ fromAgentId: null, toAgentId: chief, body: "Direction: Focus on lawyers in Mostar tomorrow, skip dentists with good sites." });
    expect(radio[1]).toMatchObject({ fromAgentId: chief, toAgentId: null, toTeam: null });
    expect(radio[1].body).toMatch(/^Noted: Focus on lawyers in Mostar/);
    expect(h.calls.filter((c) => c.url.endsWith("/chat/completions"))).toHaveLength(0); // never Claude, and no free model to ask
    // The Chief reads it in its inbox; every agent's brief carries it (pinned).
    const [atlas] = await testDb.select().from(opsAgents).where(eq(opsAgents.id, chief));
    expect((await ops.messagesForAgent(atlas)).some((x) => x.body.startsWith("Direction: Focus on lawyers"))).toBe(true);
    expect(await mem.memoryBrief(me, "")).toContain("[direction]");
  });

  it("the very next project plan and stand-up plan have it under DIRECTIONS FROM THE USER", async () => {
    project = (await testDb.insert(opsProjects).values({ userId: me, title: "200 leads in Herzegovina", goal: "A sheet of 200 local businesses without a good website.", startDay: today(), deadline: today(), leadAgentId: chief }).returning())[0].id;
    const plan = await projects.buildProjectDayPrompt(me, project);
    expect(plan.system).toContain("DIRECTIONS FROM THE USER");
    expect(plan.prompt).toContain("DIRECTIONS FROM THE USER (follow these");
    expect(plan.prompt).toMatch(/DIRECTIONS FROM THE USER[^\n]*\n- \(\d{4}-\d{2}-\d{2}\) Focus on lawyers in Mostar tomorrow, skip dentists with good sites\./);
    const standup = await day.buildStandupPrompt(me, chief);
    expect(standup.prompt).toContain("DIRECTIONS FROM THE USER (follow these");
    expect(standup.prompt).toContain("Focus on lawyers in Mostar tomorrow");
    // Agents on your computer read the same brief through ops_get_project.
    expect(JSON.stringify(await projects.projectBriefsFor(me, project))).toContain("Focus on lawyers in Mostar");
  });

  it("the Chief answers in one line from a free model when one is usable", async () => {
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_test_1234567890", model: "llama-3.3-70b-versatile" });
    h.reply = () => llm("\"Understood: Mostar law firms first, dentists with solid sites are off the list.\"");
    await directions.addDirectionFor(me, "Write all outreach drafts in Bosnian.");
    await settle();
    const [ack] = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, me), eq(opsMessages.fromAgentId, chief))).orderBy(desc(opsMessages.id)).limit(1);
    expect(ack.body).toBe("Understood: Mostar law firms first, dentists with solid sites are off the list.");
    const asked = JSON.parse(h.calls.filter((c) => c.url.endsWith("/chat/completions")).at(-1)!.body) as { messages: { content: string }[] };
    expect(asked.messages[1].content).toContain("Write all outreach drafts in Bosnian.");
  });

  it("standing orders list newest first; removing one takes it out of the next plan; it's yours only", async () => {
    const list = await directions.directionsFor(me);
    expect(list.map((d) => d.text)).toEqual(["Write all outreach drafts in Bosnian.", "Focus on lawyers in Mostar tomorrow, skip dentists with good sites."]);
    await directions.removeDirectionFor(other, list[1].id); // someone else's id: nothing happens
    expect(await directions.directionsFor(me)).toHaveLength(2);
    await directions.removeDirectionFor(me, list[1].id);
    const plan = await projects.buildProjectDayPrompt(me, project);
    expect(plan.prompt).not.toContain("Mostar");
    expect(plan.prompt).toContain("Write all outreach drafts in Bosnian.");
    await directions.removeDirectionFor(me, list[0].id);
    expect((await projects.buildProjectDayPrompt(me, project)).prompt).not.toContain("DIRECTIONS FROM THE USER");
    expect(await directions.directionsFor(other)).toEqual([]);
  });

  it("refuses empty directions and caps standing orders", async () => {
    await expect(directions.addDirectionFor(me, "  ")).rejects.toThrow(/Write the direction/);
    for (let i = 0; i < directions.MAX_DIRECTIONS; i++) {
      await testDb.insert(opsMemories).values({ userId: me, type: "direction", title: `d${i}`, body: `Direction number ${i}`, source: `direction:test${i}`, pinned: true });
    }
    await expect(directions.addDirectionFor(me, "One more thing")).rejects.toThrow(/standing orders/);
    await testDb.delete(opsMemories).where(and(eq(opsMemories.userId, me), eq(opsMemories.type, "direction")));
    await settle();
  });
});

describe("replay of the day", () => {
  it("loads today's floor (yours only, time-ordered) and rebuilds presence and the board at any moment", async () => {
    const tz = "Europe/Sarajevo";
    const [d] = replayDays(Date.now(), tz);
    const { agent: max } = await ops.createAgentFor(me, { name: "Max", role: "builder", provider: "claude" });
    const { agent: theirs } = await ops.createAgentFor(other, { name: "Nova", role: "builder", provider: "claude" });
    await ops.recordEventForAgent(theirs, { kind: "edit", label: "Editing secret.ts", url: null, status: "working" });

    const m = await ops.createMissionFor(me, { title: "Fix the login", kind: "build", agentId: max.id }) as { id: number };
    const t0 = Date.now();
    await ops.claimMissionForAgent(max, m.id);
    await ops.recordEventForAgent(max, { kind: "edit", label: "Editing auth.ts", url: null, status: "working" });
    await ops.recordEventForAgent(max, { kind: "waiting", label: "Wants permission to use Bash", url: null, status: "waiting" });
    const tWait = Date.now();
    await ops.sendMessageForAgent(max, { to: "Atlas", body: "Can you review the login fix?" });
    await ops.submitDeliverableForAgent(max, { missionId: m.id, markdown: "## Fixed\nThe login works again." });
    await testDb.update(schema.opsMissions).set({ chiefNote: null }).where(eq(schema.opsMissions.id, m.id));
    await ops.acceptMissionFor(me, m.id);
    await settle();

    const r = await replay.replayDayFor(me, d);
    expect(r.day).toBe(d);
    expect(r.events.every((e) => e.agentId !== theirs.id)).toBe(true); // Sara's floor isn't yours
    expect(r.events.map((e) => e.at)).toEqual([...r.events.map((e) => e.at)].sort((a, b) => a - b));
    // Every event remembers the status it set; your review is a note that leaves presence alone.
    const accepted = r.events.find((e) => e.label.startsWith("Accepted:"))!;
    expect(accepted.status).toBe("note");
    expect(r.events.find((e) => e.label === "Wants permission to use Bash")!.status).toBe("waiting");
    expect(r.messages.some((x) => x.from === max.id)).toBe(true);
    expect(r.missions.find((x) => x.id === m.id)).toMatchObject({ title: "Fix the login", status: "done" });

    const crew = [{ id: max.id, cloud: false }];
    expect(agentsAt(r, crew, tWait).get(max.id)).toMatchObject({ presence: "waiting", activity: "Wants permission to use Bash" });
    expect(agentsAt(r, crew, r.to).get(max.id)).toMatchObject({ presence: "idle", activity: `Submitted: Fix the login` });
    expect(missionsAt(r, t0 - 1).find((x) => x.id === m.id)?.status).toBe("open");
    expect(missionsAt(r, r.to).find((x) => x.id === m.id)?.status).toBe("done");
  });

  it("goes back 3 days at most, and only takes a real day", async () => {
    await expect(replay.replayDayFor(me, "2020-01-01")).rejects.toThrow(/3 days/);
    await expect(replay.replayDayFor(me, "yesterday")).rejects.toThrow(/Pick a day/);
    // Events from before the column existed (status null) still replay, read from their words.
    const [max] = await testDb.select().from(opsAgents).where(and(eq(opsAgents.userId, me), eq(opsAgents.name, "Max")));
    await testDb.insert(opsEvents).values({ userId: me, agentId: max.id, kind: "status", label: "Came online", url: null, status: null });
    const r = await replay.replayDayFor(me, replayDays(Date.now(), "Europe/Sarajevo")[0]);
    expect(r.events.at(-1)).toMatchObject({ label: "Came online", status: null });
    expect(agentsAt(r, [{ id: max.id }], r.to).get(max.id)).toMatchObject({ presence: "idle", activity: "Came online" });
  });
});
