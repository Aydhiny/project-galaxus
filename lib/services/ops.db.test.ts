// @vitest-environment node
//
// Ops against a REAL Postgres (PGlite: Postgres compiled to WASM, in-process),
// so every query — atomic claims, delegation, the radio inbox, jsonb skill
// cleanup, cloud dispatch through the actual runner queue — runs for real.
// The schema is the app's own (lib/db/schema.ts), and the production migration
// statements for Ops (scripts/ensure-schema.mjs) are run on top to prove they
// are valid and idempotent. Nothing here touches the network or production.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => void fn() }));

const ops = await import("@/lib/services/ops");
const tokens = await import("@/lib/services/api-tokens");
const voice = await import("@/lib/services/voice");
const { ingestHookForAgent } = ops;
const { opsAgents, opsMissions, opsMessages, opsEvents, voiceCommands, users } = schema;

let me = 0;
const day = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  const { apply } = await pushSchema(schema, testDb as never);
  await apply();
  // The production migration's Ops + weather statements must run cleanly on top (idempotent).
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  const statements = [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  expect(statements.length).toBeGreaterThan(15);
  for (const st of statements) await client.exec(st);
  const [u] = await testDb.insert(users).values({ name: "Ajdin", email: "a@example.test" }).returning();
  me = u.id;
}, 120_000);

const agentRow = async (id: number) => (await testDb.select().from(opsAgents).where(eq(opsAgents.id, id)))[0];
const missionRow = async (id: number) => (await testDb.select().from(opsMissions).where(eq(opsMissions.id, id)))[0];

describe("Ops on real Postgres", () => {
  it("an agent IS its token: create, verify, resolve", async () => {
    const { agent, token } = await ops.createAgentFor(me, { name: "Nova", role: "researcher", provider: "gemini" });
    expect(token).toMatch(/^glx_/);
    const hit = await tokens.verifyApiToken(token!);
    expect(hit).toMatchObject({ userId: me, scope: "agent" });
    expect((await ops.agentForToken(hit!.tokenId))?.id).toBe(agent.id);
    expect(agent.skills).toContain("b:deep-research"); // role defaults
    await expect(ops.createAgentFor(me, { name: "Nova", role: "scout", provider: "codex" })).rejects.toThrow(/already have/);
  });

  it("claims are atomic and role-gated; deliverables need a claim", async () => {
    const nova = (await testDb.select().from(opsAgents).where(eq(opsAgents.name, "Nova")))[0];
    const { agent: forge } = await ops.createAgentFor(me, { name: "Forge", role: "builder", provider: "codex" });
    const m = await ops.createMissionFor(me, { title: "Find grants", kind: "research", budgetUsd: "10" });
    expect((await ops.missionsForAgent(nova)).map((x) => x.id)).toContain(m.id);
    expect((await ops.missionsForAgent(forge)).map((x) => x.id)).not.toContain(m.id);
    await expect(ops.claimMissionForAgent(forge, m.id)).rejects.toThrow(/isn't open to you/);
    await expect(ops.submitDeliverableForAgent(nova, { missionId: m.id, markdown: "too early to submit" })).rejects.toThrow(/claimed/);
    await ops.claimMissionForAgent(nova, m.id);
    await expect(ops.claimMissionForAgent(nova, m.id)).rejects.toThrow(); // second claim loses
    const r = await ops.recordEventForAgent(nova, { kind: "search", label: "x", url: null }, { missionId: m.id, costCents: 1200 });
    expect(r.warning).toMatch(/Over budget/);
    await ops.submitDeliverableForAgent(nova, { missionId: m.id, markdown: "# Grants\n- BOOST" });
    expect(await missionRow(m.id)).toMatchObject({ status: "submitted", spentCents: 1200 });
    await ops.reopenMissionFor(me, m.id, "Add deadlines please");
    expect(await missionRow(m.id)).toMatchObject({ status: "open", agentId: null });
    expect((await missionRow(m.id)).brief).toContain("Add deadlines please");
  });

  it("delegation: budgets come out of the parent; the delegator hears back", async () => {
    const nova = (await testDb.select().from(opsAgents).where(eq(opsAgents.name, "Nova")))[0];
    const { agent: quill } = await ops.createAgentFor(me, { name: "Quill", role: "scribe", provider: "claude" });
    const parent = await ops.createMissionFor(me, { title: "Grant report", kind: "research", budgetUsd: "10" });
    await ops.claimMissionForAgent(nova, parent.id);
    await expect(ops.createMissionForAgent(nova, { title: "Write it up", role: "scribe", budgetUsd: 11, parentMissionId: parent.id })).rejects.toThrow(/left on the parent/);
    const sub = await ops.createMissionForAgent(nova, { title: "Write it up", role: "scribe", budgetUsd: 4, parentMissionId: parent.id });
    expect(await missionRow(sub.id)).toMatchObject({ parentId: parent.id, createdByAgentId: nova.id, role: "scribe", budgetCents: 400 });
    await expect(ops.createMissionForAgent(quill, { title: "Sneaky", parentMissionId: parent.id })).rejects.toThrow(/working on/);

    await ops.claimMissionForAgent(quill, sub.id);
    await ops.submitDeliverableForAgent(quill, { missionId: sub.id, markdown: "The write-up is done." });
    const inbox = await ops.messagesForAgent(nova);
    expect(inbox[0]).toMatchObject({ from: "Quill", unread: true, mission_id: parent.id });
    expect(inbox[0].body).toContain("The write-up is done.");
    expect((await ops.messagesForAgent(nova))[0].unread).toBe(false); // reading marks read
  });

  it("radio: direct, team and broadcast messages reach the right inboxes", async () => {
    const [nova, forge, quill] = await Promise.all(["Nova", "Forge", "Quill"].map(async (n) => (await testDb.select().from(opsAgents).where(eq(opsAgents.name, n)))[0]));
    await ops.sendMessageFor(me, { toTeam: "build", body: "Build team: ship it" });
    await ops.sendMessageFor(me, { body: "Everyone: focus on Sarajevo" });
    await ops.sendMessageForAgent(nova, { to: "quill", body: "Can you format this?" }); // names are case-insensitive
    await expect(ops.sendMessageForAgent(nova, { to: "Ghost", body: "hi" })).rejects.toThrow(/No agent/);
    const f = (await ops.messagesForAgent(forge)).map((m) => m.body);
    expect(f).toEqual(expect.arrayContaining(["Build team: ship it", "Everyone: focus on Sarajevo"]));
    expect(f).not.toContain("Can you format this?");
    const q = (await ops.messagesForAgent(quill)).map((m) => m.body);
    expect(q).toContain("Can you format this?");
    expect(q).not.toContain("Build team: ship it");
    expect((await ops.messagesForAgent(nova)).map((m) => m.body)).not.toContain("Can you format this?"); // not its own
  });

  it("skills: custom skills reach the agent at check-in and vanish everywhere when deleted", async () => {
    const nova = (await testDb.select().from(opsAgents).where(eq(opsAgents.name, "Nova")))[0];
    const s = await ops.createSkillFor(me, { name: "My voice", instructions: "Short sentences, no buzzwords." });
    await ops.updateAgentFor(me, nova.id, { skills: [`c:${s.id}`, "b:cite-sources", "b:bogus"] });
    expect((await agentRow(nova.id)).skills).toEqual([`c:${s.id}`, "b:cite-sources"]);
    const c = await ops.checkinForAgent(await agentRow(nova.id));
    expect(c.skills.map((x) => x.name)).toEqual(["My voice", "Cite everything"]);
    expect(c.crew.map((x) => x.name)).toEqual(expect.arrayContaining(["Forge", "Quill"]));
    await ops.deleteSkillFor(me, s.id);
    expect((await agentRow(nova.id)).skills).toEqual(["b:cite-sources"]);
  });

  it("the day: templates fill the board, the last day repeats", async () => {
    const n = await ops.applyTemplateFor(me, "money");
    expect(n).toBe(3);
    const o = await ops.opsOverviewFor(me);
    expect(o.shift).toMatchObject({ startsAt: "09:00", endsAt: "18:00" });
    expect(o.missions.filter((m) => m.title.startsWith("Find 5 freelance gigs"))).toHaveLength(1);
    // An earlier day to repeat.
    await testDb.insert(opsMissions).values({ userId: me, day: "2026-01-02", title: "Old plan item", kind: "other", role: "chief" });
    expect(await ops.repeatLastDayFor(me)).toBe(1);
    expect((await ops.opsOverviewFor(me)).missions.some((m) => m.title === "Old plan item" && m.day === day())).toBe(true);
    await ops.setDayFor(me, null); // back to "no shift" for the cloud test
  });

  it("hooks from Gemini land in the feed and set 'needs you'", async () => {
    const nova = (await testDb.select().from(opsAgents).where(eq(opsAgents.name, "Nova")))[0];
    expect(await ingestHookForAgent(nova, { hook_event_name: "AfterTool", tool_name: "google_web_search", tool_input: { query: "BiH grants" } })).toBe(true);
    expect(await ingestHookForAgent(nova, { hook_event_name: "Notification", message: "Gemini needs permission" })).toBe(true);
    expect(await agentRow(nova.id)).toMatchObject({ status: "waiting", activityKind: "waiting" });
    expect(await ops.opsCountsFor(me)).toMatchObject({ waiting: 1 });
    const ev = await testDb.select().from(opsEvents).where(eq(opsEvents.agentId, nova.id));
    expect(ev.some((e) => e.label === "Searching: BiH grants")).toBe(true);
  });

  it("cloud agents: dispatch → runner claim → result filed as the deliverable; a failure goes back on the board", async () => {
    // Without Claude connected, nothing is claimed.
    const { agent: atlas, token } = await ops.createAgentFor(me, { name: "Atlas", role: "chief", provider: "claude", cloud: true });
    expect(token).toBeNull();
    const m = await ops.createMissionFor(me, { title: "Plan the week", kind: "other", agentId: atlas.id });
    expect((await missionRow(m.id)).status).toBe("open");

    // Connect a runner (a voice-scope token), then dispatch.
    await tokens.createApiTokenFor(me, "Runner", "voice");
    expect(await ops.dispatchCloudFor(me)).toMatchObject({ dispatched: 1 });
    const held = await missionRow(m.id);
    expect(held).toMatchObject({ status: "claimed", agentId: atlas.id });
    expect(held.jobId).toBeTruthy();
    expect((await ops.dispatchCloudFor(me)).dispatched).toBe(0); // one mission at a time per agent

    // The GitHub runner claims the job: it gets web tools only and a prompt built from the mission.
    const job = await voice.claimNextFor(me);
    expect(job).toMatchObject({ id: held.jobId, tools: false, web: true });
    expect(job!.prompt).toContain("MISSION: Plan the week");
    expect(job!.prompt).toContain("Atlas");
    expect((await agentRow(atlas.id)).status).toBe("working");

    await voice.completeFor(me, job!.id, { ok: true, summary: "# Week plan\n- Mon: outreach" });
    expect(await missionRow(m.id)).toMatchObject({ status: "submitted", deliverable: "# Week plan\n- Mon: outreach", jobId: null });

    // Filing the result chained Atlas straight onto the next open Chief mission (the earlier "Old plan item").
    const next = (await testDb.select().from(opsMissions).where(eq(opsMissions.agentId, atlas.id))).find((x) => x.status === "claimed")!;
    expect(next.title).toBe("Old plan item");

    // A failed run: the mission goes back to the board with a reason on the desk.
    const job2 = await voice.claimNextFor(me);
    expect(job2?.prompt).toContain("MISSION: Old plan item");
    await voice.completeFor(me, job2!.id, { ok: false, error: "Claude exited with 1" });
    expect(await missionRow(next.id)).toMatchObject({ status: "open", jobId: null, agentId: null });
    expect((await agentRow(atlas.id)).activity).toContain("Couldn't finish");
    const [vc] = await testDb.select().from(voiceCommands).where(eq(voiceCommands.id, job2!.id));
    expect(vc.status).toBe("failed");
  });

  it("cloud agents respect the shift", async () => {
    const tz = "Europe/Sarajevo";
    const { hhmmIn } = await import("@/lib/ops");
    const now = hhmmIn(tz);
    const plus = (h: number) => `${String((Number(now.slice(0, 2)) + h) % 24).padStart(2, "0")}:00`;
    await ops.setDayFor(me, { startsAt: plus(2), endsAt: plus(4) }); // starts later today
    expect(await ops.dispatchCloudFor(me)).toMatchObject({ dispatched: 0, reason: "off shift" });
    await ops.setDayFor(me, null);
  });

  it("removing an agent revokes its token and frees its missions", async () => {
    const { agent, token } = await ops.createAgentFor(me, { name: "Temp", role: "comms", provider: "grok" });
    const m = await ops.createMissionFor(me, { title: "Draft hello", kind: "outreach" });
    await ops.claimMissionForAgent(agent, m.id);
    await ops.removeAgentFor(me, agent.id);
    expect(await tokens.verifyApiToken(token!)).toBeNull();
    expect(await missionRow(m.id)).toMatchObject({ status: "open", agentId: null });
  });

  it("the overview has everything the page needs", async () => {
    const o = await ops.opsOverviewFor(me);
    expect(o.agents.length).toBeGreaterThanOrEqual(4);
    expect(o.messages.length).toBeGreaterThan(0);
    expect(o.skills.length).toBeGreaterThan(5);
    expect(o.claudeMode).toBe("runner");
    expect(o.shiftNow.state).toBe("none");
    const [{ n }] = await testDb.select({ n: sql<number>`count(*)::int` }).from(opsMessages);
    expect(n).toBeGreaterThan(3);
  });

  it("end to end over HTTP: a real MCP client and the hook endpoint, with a real agent token", async () => {
    const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const mcp = await import("@/app/api/mcp/route");
    const hookRoute = await import("@/app/api/agents/event/route");
    const { token, agent } = await ops.createAgentFor(me, { name: "Wire", role: "scout", provider: "cursor" });
    const m = await ops.createMissionFor(me, { title: "Find a monitor", kind: "procure", budgetUsd: "3" });

    const fetchIn = (async (url: string | URL, init?: RequestInit) => {
      const req = new Request(url, init);
      const fn = (mcp as unknown as Record<string, (r: Request) => Promise<Response>>)[req.method] ?? mcp.POST;
      return fn(req);
    }) as typeof fetch;
    const c = new Client({ name: "e2e", version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), { fetch: fetchIn, requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await c.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
      if (r.isError) throw new Error(r.content[0].text);
      return JSON.parse(r.content[0].text);
    };
    const checkin = await call("ops_checkin");
    expect(checkin.you.name).toBe("Wire");
    expect(checkin.missions.map((x: { id: number }) => x.id)).toContain(m.id);
    await call("ops_claim_mission", { mission_id: m.id });
    await call("ops_log_activity", { kind: "browse", label: "Reading olx.ba", url: "https://olx.ba/x", mission_id: m.id, cost_usd: 0.5 });
    expect((await call("ops_list_crew")).some((x: { name: string }) => x.name === "Nova")).toBe(true);
    await call("ops_send_message", { to: "Nova", body: "Found 3 monitors" });
    await call("ops_submit_deliverable", { mission_id: m.id, markdown: "Best: Dell P2723, 520 KM" });
    expect(await missionRow(m.id)).toMatchObject({ status: "submitted", spentCents: 50 });
    await expect(call("list_tasks")).rejects.toThrow(/isn't available to agents/);

    // The hook endpoint (what public/agent-hook.mjs posts to), Cursor-shaped after normalising.
    const post = (body: unknown, auth = `Bearer ${token}`) => hookRoute.POST(new Request("http://localhost/api/agents/event", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never);
    expect((await post({ hook_event_name: "afterShellExecution", tool_name: "Bash", tool_input: { command: "npm test" } })).status).toBe(200);
    expect(await agentRow(agent.id)).toMatchObject({ activity: "Running: npm test", activityKind: "shell" });
    expect((await post({ hook_event_name: "Stop" }, "Bearer glx_nope")).status).toBe(401);
    await c.close();
  }, 60_000);
});
