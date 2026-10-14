// @vitest-environment node
//
// Ops round 2 against a REAL Postgres (PGlite) with the app's own schema and the
// production migration statements: measured costs through the real runner
// queue, scorecards, head-to-head, recurring missions, the library, deliverables
// into Tasks/Pages/Outreach/Reddit, stand-up + debrief with a cloud Chief,
// linked facilities between two real users, and voice/MCP → missions.
// The only stand-in is GitHub's HTTP API in the PR test (no network in tests).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => void fn() }));
// Next cache invalidation needs a live Next request; outside one it is a no-op here (as in lib/mcp/route.test.ts).
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const day = await import("@/lib/services/ops-day");
const deliver = await import("@/lib/services/ops-deliver");
const links = await import("@/lib/services/ops-links");
const tokens = await import("@/lib/services/api-tokens");
const voice = await import("@/lib/services/voice");
const { opsMissions, opsMessages, opsDays, opsAgents, tasks, workspacePages, leads, redditPosts, notifications, users, voiceCommands } = schema;

let me = 0, faruk = 0;
const today = () => new Date().toISOString().slice(0, 10);
const mission = async (id: number) => (await testDb.select().from(opsMissions).where(eq(opsMissions.id, id)))[0];
const agentNamed = async (userId: number, name: string) => (await testDb.select().from(opsAgents).where(and(eq(opsAgents.userId, userId), eq(opsAgents.name, name))))[0];
/** Run the runner's side of one queued job: claim it, answer it, report back (exactly what voice.yml does). */
async function runJob(userId: number, answer: string | null, costCents: number | null) {
  const job = await voice.claimNextFor(userId);
  if (!job) throw new Error("no job queued");
  await voice.completeFor(userId, job.id, answer != null ? { ok: true, summary: answer, costCents } : { ok: false, error: "Claude exited with 1", costCents });
  return job;
}

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin Mehmedović", email: "ajdin@example.test" }).returning())[0].id;
  faruk = (await testDb.insert(users).values({ name: "Faruk Hadžić", email: "Faruk@Example.test" }).returning())[0].id;
  await tokens.createApiTokenFor(me, "Runner", "voice"); // Claude connected via the runner
}, 120_000);

describe("Ops round 2 on real Postgres", () => {
  it("measured costs: the runner's real cost lands on the mission, marked measured; failures cost too", async () => {
    const { agent: atlas } = await ops.createAgentFor(me, { name: "Atlas", role: "researcher", provider: "claude", cloud: true });
    const m = await ops.createMissionFor(me, { title: "Compare VPS hosts", kind: "research", agentId: atlas.id, budgetUsd: "2" }) as { id: number };
    expect((await mission(m.id)).status).toBe("claimed");
    const job = await runJob(me, "# VPS\n- Hetzner CX22, €4", 37);
    expect(job.web).toBe(true);
    expect(await mission(m.id)).toMatchObject({ status: "submitted", spentCents: 37, costMeasured: true, submittedBy: atlas.id });
    // You get a push (here: the bell row notifyUser always writes).
    expect((await testDb.select().from(notifications).where(eq(notifications.userId, me))).some((n) => n.title === "Atlas delivered")).toBe(true);

    const m2 = await ops.createMissionFor(me, { title: "Second", kind: "research", agentId: atlas.id }) as { id: number };
    await runJob(me, null, 12);
    expect(await mission(m2.id)).toMatchObject({ status: "open", spentCents: 12, costMeasured: true });
    await ops.cancelMissionFor(me, m2.id);
  });

  it("never starts a cloud mission that's already over budget", async () => {
    const atlas = await agentNamed(me, "Atlas");
    const [over] = await testDb.insert(opsMissions).values({ userId: me, day: today(), title: "Over", kind: "other", agentId: atlas.id, budgetCents: 100, spentCents: 150 }).returning();
    await ops.dispatchCloudFor(me);
    expect((await mission(over.id)).status).toBe("open");
    await ops.cancelMissionFor(me, over.id);
  });

  it("scorecards follow your accept / send-back decisions", async () => {
    const atlas = await agentNamed(me, "Atlas");
    const delivered = (await testDb.select().from(opsMissions).where(eq(opsMissions.title, "Compare VPS hosts")))[0];
    await ops.reopenMissionFor(me, delivered.id, "Add prices in KM");
    expect(await mission(delivered.id)).toMatchObject({ status: "claimed", reopens: 1 }); // the cloud agent took it straight back
    await runJob(me, "# VPS (KM)\n- Hetzner CX22, 8 KM", 20);
    await ops.acceptMissionFor(me, delivered.id);
    const o = await ops.opsOverviewFor(me);
    expect(o.scores[atlas.id]).toMatchObject({ delivered: 1, accepted: 1, sentBack: 1 });
    expect(o.scores[atlas.id].costPerAcceptedCents).toBe(57);
  });

  it("head-to-head: two agents, one winner, the loser closes", async () => {
    const { agent: nova } = await ops.createAgentFor(me, { name: "Nova", role: "researcher", provider: "codex" });
    const { agent: sage } = await ops.createAgentFor(me, { name: "Sage", role: "researcher", provider: "gemini" });
    await expect(ops.createMissionFor(me, { title: "Duel", duelAgentIds: [nova.id] })).rejects.toThrow(/two agents/);
    const r = await ops.createMissionFor(me, { title: "Best BiH accounting app", kind: "research", duelAgentIds: [nova.id, sage.id] }) as { id: number; duel: boolean };
    const pair = await testDb.select().from(opsMissions).where(eq(opsMissions.duelId, r.id));
    expect(pair.map((p) => p.agentId).sort()).toEqual([nova.id, sage.id].sort());
    for (const [a, p] of [[nova, pair.find((x) => x.agentId === nova.id)!], [sage, pair.find((x) => x.agentId === sage.id)!]] as const) {
      await ops.claimMissionForAgent(a, p.id);
      await ops.submitDeliverableForAgent(a, { missionId: p.id, markdown: `${a.name}'s answer: use Pantheon` });
    }
    const sagesId = pair.find((x) => x.agentId === sage.id)!.id;
    await ops.acceptMissionFor(me, sagesId);
    expect((await mission(sagesId)).status).toBe("done");
    expect((await mission(pair.find((x) => x.agentId === nova.id)!.id)).status).toBe("cancelled");
    const o = await ops.opsOverviewFor(me);
    expect(o.scores[sage.id]).toMatchObject({ wins: 1 });
    expect(o.scores[nova.id]).toMatchObject({ losses: 1 });
  });

  it("recurring missions post once per due day", async () => {
    const r = await ops.createMissionFor(me, { title: "Gig check", kind: "procure", repeat: "daily", repeatTime: "00:00" }) as { id: number; recurring: boolean };
    expect(r.recurring).toBe(true);
    const posted = await testDb.select().from(opsMissions).where(eq(opsMissions.recurringId, r.id));
    expect(posted).toHaveLength(1); // today's copy went up immediately
    expect(await day.postDueRecurringFor(me)).toBe(0); // not twice
    await ops.removeRecurringFor(me, r.id);
    expect((await ops.opsOverviewFor(me)).recurring).toHaveLength(0);
  });

  it("the library finds accepted work by its words", async () => {
    const hits = await ops.searchLibraryFor(me, "hetzner VPS prices");
    expect(hits[0]).toMatchObject({ title: "Compare VPS hosts" });
    expect(hits[0].excerpt).toContain("Hetzner");
    expect(await ops.searchLibraryFor(me, "unrelated quantum gardening")).toEqual([]);
    // A cloud agent's prompt gets related past work.
    const atlas = await agentNamed(me, "Atlas");
    await ops.createMissionFor(me, { title: "Cheaper VPS than Hetzner?", kind: "research", agentId: atlas.id });
    const job = await voice.claimNextFor(me);
    expect(job!.prompt).toContain("Related work already done");
    expect(job!.prompt).toContain("Compare VPS hosts");
    await voice.completeFor(me, job!.id, { ok: true, summary: "Netcup is cheaper." });
  });

  it("use it: tasks, a page, an Outreach lead and a Reddit draft from a deliverable", async () => {
    const m = (await testDb.select().from(opsMissions).where(eq(opsMissions.title, "Compare VPS hosts")))[0];
    expect(await deliver.missionToTasksFor(me, m.id, ["Order Hetzner CX22", "  ", "Order Hetzner CX22"])).toBe(1);
    expect((await testDb.select().from(tasks).where(eq(tasks.userId, me))).map((t) => t.title)).toContain("Order Hetzner CX22");
    const pageId = await deliver.missionToPageFor(me, m.id);
    const [page] = await testDb.select().from(workspacePages).where(eq(workspacePages.id, pageId));
    expect(page.blocks.map((b) => b.type)).toEqual(["callout", "h1", "bullet"]);
    await deliver.missionToLeadFor(me, m.id, { name: "Hetzner Reseller Sarajevo", phone: "+38761123456", website: "https://example.ba", city: "Sarajevo" });
    expect((await testDb.select().from(leads).where(eq(leads.userId, me)))[0]).toMatchObject({ name: "Hetzner Reseller Sarajevo", category: "From Ops" });
    await expect(deliver.missionToRedditFor(me, m.id, { subreddit: "r/bad name!", title: "x", body: "" })).rejects.toThrow(/subreddit/);
    await deliver.missionToRedditFor(me, m.id, { subreddit: "r/indiegames", title: "We compared VPS hosts", body: "..." });
    expect((await testDb.select().from(redditPosts).where(eq(redditPosts.userId, me)))[0]).toMatchObject({ subreddit: "indiegames", status: "draft" });
    // Someone else can't touch your missions.
    await expect(deliver.missionToPageFor(faruk, m.id)).rejects.toThrow(/not found/);
  });

  it("PRs: a PR url an agent logs lands on its mission; status comes from GitHub", async () => {
    const nova = await agentNamed(me, "Nova");
    const m = await ops.createMissionFor(me, { title: "Fix login bug", kind: "build", agentId: nova.id }) as { id: number };
    await ops.claimMissionForAgent(nova, m.id);
    await ops.recordEventForAgent(nova, { kind: "browse", label: "Opened PR", url: "https://github.com/Aydhiny/project-galaxus/pull/42" }, { missionId: m.id });
    expect((await mission(m.id)).prUrl).toBe("https://github.com/Aydhiny/project-galaxus/pull/42");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const u = String(url);
      const body = u.endsWith("/pulls/42") ? { title: "Fix login", state: "open", merged: false, draft: false, head: { sha: "abc" } }
        : u.includes("/check-runs") ? { check_runs: [{ status: "completed", conclusion: "success" }] }
        : [{ state: "APPROVED", user: { login: "faruk" } }];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    try {
      const st = await deliver.prStatusesFor(me, ["https://github.com/Aydhiny/project-galaxus/pull/42"]);
      expect(st["https://github.com/Aydhiny/project-galaxus/pull/42"]).toMatchObject({ state: "open", checks: "passing", review: "approved" });
    } finally { globalThis.fetch = realFetch; }
  });

  it("stand-up: a radio summary, and a cloud Chief plans what's missing (capped)", async () => {
    await ops.setDayFor(me, { startsAt: "00:00", endsAt: "23:59", focus: "Land 2 clients" });
    const { agent: chief } = await ops.createAgentFor(me, { name: "Boss", role: "chief", provider: "claude", cloud: true });
    // The chief may already have picked an open chief mission: finish that first so the stand-up job is next in line.
    while (true) {
      const next = await voice.claimNextFor(me);
      if (!next) break;
      await voice.completeFor(me, next.id, { ok: true, summary: "done" });
    }
    const r = await day.standupFor(me, { manual: true });
    expect(r).toMatchObject({ done: true, planned: true });
    const summary = (await testDb.select().from(opsMessages).where(eq(opsMessages.userId, me))).find((x) => x.body.startsWith("Stand-up"));
    expect(summary?.body).toContain("Focus: Land 2 clients");
    const plan = JSON.stringify({ message: "Hawk: gigs. Quill: pitch.", missions: [
      { title: "Find 5 web gigs", brief: "Remote", kind: "procure", role: "scout", budget_usd: 5 },
      { title: "Draft pitch", kind: "document", role: "scribe", budget_usd: 50 }, // capped to 5
      { title: "x" }, // too short: skipped
      { title: "Third", kind: "research", budget_usd: 5 },
      { title: "Over the total", kind: "research", budget_usd: 5 }, // would pass $15 total: stops
    ] });
    const job = await voice.claimNextFor(me);
    expect(job!.system).toContain("Chief of staff");
    await voice.completeFor(me, job!.id, { ok: true, summary: plan });
    const made = await testDb.select().from(opsMissions).where(eq(opsMissions.createdByAgentId, chief.id));
    expect(made.map((m) => m.title).sort()).toEqual(["Draft pitch", "Find 5 web gigs", "Third"]);
    expect(made.find((m) => m.title === "Draft pitch")!.budgetCents).toBe(500);
    expect((await testDb.select().from(opsMessages).where(eq(opsMessages.fromAgentId, chief.id))).some((x) => x.body.includes("Hawk: gigs"))).toBe(true);
  });

  it("debrief: a page with the day's facts, once; the Chief's notes are appended", async () => {
    const [row] = await testDb.select().from(opsDays).where(and(eq(opsDays.userId, me), eq(opsDays.day, today())));
    // Let the cloud agents' new missions run out of the way first.
    while (true) { const n = await voice.claimNextFor(me); if (!n || n.system.includes("short notes")) { if (n) await voice.completeFor(me, n.id, { ok: true, summary: "x" }); break; } await voice.completeFor(me, n.id, { ok: true, summary: "Done." }); }
    const pageId = await day.debriefFor(me, row);
    expect(pageId).toBeTruthy();
    expect(await day.debriefFor(me, row)).toBeNull(); // only once
    const [page] = await testDb.select().from(workspacePages).where(eq(workspacePages.id, pageId!));
    expect(page.title).toBe(`Ops debrief · ${today()}`);
    const text = page.blocks.map((b) => b.text).join("\n");
    expect(text).toContain("Done");
    expect(text).toMatch(/measured from real runs/);
    const job = await voice.claimNextFor(me);
    expect(job!.system).toContain("short notes");
    await voice.completeFor(me, job!.id, { ok: true, summary: "- Great day\n- Watch the budget" });
    const [after] = await testDb.select().from(workspacePages).where(eq(workspacePages.id, pageId!));
    expect(after.blocks.map((b) => b.text)).toEqual(expect.arrayContaining(["Chief's notes", "Great day"]));
    expect(await day.opsTickFor(me)).toMatchObject({ debriefs: 0 });
  });

  it("linked facilities: invite → accept → agents radio across, as requests; capped; cut any time", async () => {
    await expect(links.inviteLinkFor(me, "nobody@example.test")).rejects.toThrow(/No Galaxus account/);
    await expect(links.inviteLinkFor(me, "ajdin@example.test")).rejects.toThrow(/own facility/);
    await links.inviteLinkFor(me, "faruk@example.test", true); // case-insensitive email
    const [mine] = await links.linksFor(me);
    expect(mine).toMatchObject({ status: "pending", direction: "out", partner: "Faruk" });
    const { agent: fNova } = await ops.createAgentFor(faruk, { name: "Nova", role: "researcher", provider: "claude" });
    const atlas = await agentNamed(me, "Atlas");

    await expect(ops.sendMessageForAgent(atlas, { facility: "Faruk", body: "hi" })).rejects.toThrow(/No linked facility/); // not accepted yet
    const [invite] = await links.linksFor(faruk);
    await links.respondLinkFor(faruk, invite.id, true, false); // accepts, keeps his crew private
    expect((await links.partnerCrewsFor(me))[0]).toMatchObject({ facility: "Faruk", crew: expect.stringContaining("not shared") });
    await expect(ops.sendMessageForAgent(atlas, { facility: "faruk", to: "Nova", body: "hi" })).rejects.toThrow(/doesn't share/);
    await ops.sendMessageForAgent(atlas, { facility: "faruk", body: "Can your crew share BiH accounting tips?" });

    // Faruk's agent sees it as an external request (with the safety note); our own crew doesn't get our outgoing copy.
    const inbox = await ops.messagesForAgent(fNova);
    expect(inbox[0]).toMatchObject({ from: "Ajdin / Atlas (linked facility)", external: true });
    expect((inbox[0] as { note?: string }).note).toMatch(/request/);
    const myNova = await agentNamed(me, "Nova");
    expect((await ops.messagesForAgent(myNova)).some((x) => x.body.includes("accounting tips"))).toBe(false);
    // Faruk shares his crew now; we can address Nova by name, and he can reply.
    await links.setLinkShareFor(faruk, invite.id, true);
    await ops.sendMessageForAgent(atlas, { facility: "Faruk", to: "nova", body: "Thanks Nova" });
    await ops.sendMessageForAgent(fNova, { facility: "Ajdin", to: "Atlas", body: "Use Pantheon." });
    expect((await ops.messagesForAgent(atlas))[0]).toMatchObject({ from: "Faruk / Nova (linked facility)", body: "Use Pantheon." });
    // Cut the link: nothing crosses any more.
    await links.removeLinkFor(faruk, invite.id);
    await expect(ops.sendMessageForAgent(atlas, { facility: "Faruk", body: "still there?" })).rejects.toThrow(/No linked facility/);
  });

  it("voice / your own MCP clients can post missions by agent name; agent tokens can't", async () => {
    const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const mcp = await import("@/app/api/mcp/route");
    const fetchIn = (async (url: string | URL, init?: RequestInit) => {
      const req = new Request(url, init);
      return ((mcp as unknown as Record<string, (r: Request) => Promise<Response>>)[req.method] ?? mcp.POST)(req);
    }) as typeof fetch;
    const connect = async (token: string) => {
      const c = new Client({ name: "t", version: "1" });
      await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), { fetch: fetchIn, requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
      return c;
    };
    const { token: voiceToken } = await tokens.createApiTokenFor(me, "Voice 2", "voice");
    const c = await connect(voiceToken);
    const r = (await c.callTool({ name: "create_ops_mission", arguments: { title: "Research BiH grants", agent: "sage" } })) as { content: { text: string }[]; isError?: boolean };
    expect(r.isError, r.content[0]?.text).toBeFalsy();
    const sage = await agentNamed(me, "Sage");
    expect((await testDb.select().from(opsMissions).where(eq(opsMissions.title, "Research BiH grants")))[0]).toMatchObject({ agentId: sage.id });
    const bad = (await c.callTool({ name: "create_ops_mission", arguments: { title: "Nope", agent: "Ghost" } })) as { isError?: boolean; content: { text: string }[] };
    expect(bad.isError).toBe(true);
    await c.close();

    const { token: agentToken } = await ops.createAgentFor(me, { name: "Probe", role: "scout", provider: "grok" });
    const a = await connect(agentToken!);
    const refused = (await a.callTool({ name: "create_ops_mission", arguments: { title: "Sneaky" } })) as { isError?: boolean; content: { text: string }[] };
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("isn't available to agents");
    const lib = (await a.callTool({ name: "ops_search_library", arguments: { query: "hetzner" } })) as { content: { text: string }[] };
    expect(lib.content[0].text).toContain("Compare VPS hosts");
    await a.close();
    expect(await testDb.select().from(voiceCommands)).not.toHaveLength(0);
  }, 60_000);
});
