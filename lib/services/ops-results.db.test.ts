// @vitest-environment node
//
// The project results loaders against a REAL Postgres (PGlite) with the app's
// schema and the production migration statements (same harness as
// ops-round3.db.test.ts): the owner sees the project, its merged sheet, every
// result and the timeline; another user sees nothing, and the page 404s for them.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
const client = new PGlite();
const testDb = drizzle(client, { schema });
const h = vi.hoisted(() => ({ userId: 0 }));
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
// The page reads the signed-in user; here, whoever the test says.
vi.mock("@/lib/auth-session", () => ({ requireUserId: async () => { if (!h.userId) throw new Error("Not authenticated."); return h.userId; } }));

const results = await import("@/lib/services/ops-results");
const { users, opsAgents, opsProjects, opsMissions, opsEvents, opsMessages, opsMemories } = schema;

let me = 0, other = 0, projectId = 0;
const today = () => new Date().toISOString().slice(0, 10);
const SHEET_MD = (rows: string[]) => `Found these.\n\n| Name | Category | Address | Phone | WhatsApp | Email | Website | Website status | Source |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`;

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test" }).returning())[0].id;
  other = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;

  const [chief] = await testDb.insert(opsAgents).values({ userId: me, name: "Atlas", role: "chief", provider: "claude", cloud: true }).returning();
  const [nova] = await testDb.insert(opsAgents).values({ userId: me, name: "Nova", role: "scout", provider: "claude", cloud: true, engine: "free" }).returning();
  const t = today();
  const [p] = await testDb.insert(opsProjects).values({
    userId: me, title: "Dentist leads", goal: "Find at least 10 leads: dentists in Sarajevo with WhatsApp", startDay: t, deadline: t,
    leadAgentId: chief.id, plan: "## Plan\n- Nova finds dentists", planError: "the free model timed out", planStartedAt: new Date(),
  }).returning();
  projectId = p.id;
  const [m1] = await testDb.insert(opsMissions).values({
    userId: me, day: t, projectId, title: "Find dentists in Sarajevo", agentId: nova.id, submittedBy: nova.id, status: "done", spentCents: 0, freeCalls: 3,
    chiefNote: "✓ Good rows", reviewRound: 1, submittedAt: new Date(),
    deliverable: SHEET_MD([
      "| Zubar Ćosić | Dentists | Ferhadija 12, Sarajevo | 061 123 456 | yes | info@cosic.ba |  | No website | https://www.openstreetmap.org/node/1 |",
      "| Dental Plus | Dentists | Titova 5, Sarajevo | 033 444 555 | no |  | https://facebook.com/dp | Facebook only | https://www.openstreetmap.org/node/2 |",
    ]),
  }).returning();
  await testDb.insert(opsMissions).values({ userId: me, day: t, projectId, title: "Find more dentists", agentId: nova.id, status: "open" });
  // Another project's mission must not leak in.
  await testDb.insert(opsMissions).values({ userId: me, day: t, title: "Unrelated", status: "done", deliverable: SHEET_MD(["| X | Y | Z | 061 000 000 | yes | x@x.ba | | | |"]) });
  await testDb.insert(opsEvents).values([
    { userId: me, agentId: nova.id, missionId: m1.id, kind: "status", label: "Delivered 2 rows", status: "idle" },
    { userId: me, agentId: nova.id, missionId: m1.id, kind: "read", label: "Reading a page", status: "working" },
  ]);
  await testDb.insert(opsMessages).values([
    { userId: me, fromAgentId: chief.id, body: "Dentist leads · day 1/1\nNova: dentists in Sarajevo." },
    { userId: me, fromAgentId: chief.id, toAgentId: nova.id, body: 'For you today: "Find dentists in Sarajevo"' },
    { userId: me, fromAgentId: chief.id, body: "Some other project · day 1/3\nnot this one" },
  ]);
  await testDb.insert(opsMemories).values({ userId: me, type: "decision", title: "Final solution: Dentist leads", body: "2 leads so far.", source: `project-final:${projectId}`, projectId });
}, 120_000);

describe("project results loaders", () => {
  it("the owner gets the index with live progress", async () => {
    const { projects } = await results.resultsIndexFor(me);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: projectId, title: "Dentist leads", lead: { name: "Atlas", cloud: true }, sheetRows: 2, done: 1, active: 1, freeRuns: 3, needWebsite: 2,
      progress: { rows: 2, target: 10, whatsapp: 1, emails: 1 },
    });
    expect(projects[0].lastActivity).toBeTruthy();
  });

  it("the owner gets the project in full: sheet, results, timeline, plan, final", async () => {
    const r = (await results.projectResultsFor(me, projectId))!;
    expect(r.project).toMatchObject({ title: "Dentist leads", lead: { name: "Atlas" }, plan: expect.stringContaining("Nova finds dentists"), needWebsite: 2 });
    expect(r.sheet.slice(1).map((x) => x[0])).toEqual(["Zubar Ćosić", "Dental Plus"]); // the unrelated mission's row isn't in it
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ agent: { name: "Nova", engine: "free" }, chiefNote: "✓ Good rows", reviewRound: 1, freeCalls: 3 });
    const has = (kind: string, start: string) => r.timeline.some((x) => x.kind === kind && x.text.startsWith(start));
    expect(has("plan", "Dentist leads · day 1/1 · Nova: dentists")).toBe(true);
    expect(has("handoff", 'For you today: "Find dentists in Sarajevo"')).toBe(true);
    expect(has("delivery", "Delivered 2 rows")).toBe(true); // an event
    expect(has("delivery", 'Delivered "Find dentists in Sarajevo"')).toBe(true); // the mission's submittedAt
    expect(has("review", 'Round 1 · "Find dentists in Sarajevo": ✓ Good rows')).toBe(true);
    expect(has("error", "Couldn't plan: the free model timed out")).toBe(true);
    expect(has("decision", "Final solution: Dentist leads")).toBe(true);
    const all = r.timeline.map((x) => x.text).join(" | ");
    expect(all).not.toContain("Some other project"); // the lead's radio about another project
    expect(all).not.toContain("Reading a page"); // working noise stays out
    expect(r.final).toEqual({ md: "2 leads so far.", full: false });
  });

  it("another user gets nothing, and a bad id is nothing", async () => {
    expect((await results.resultsIndexFor(other)).projects).toEqual([]);
    expect(await results.projectResultsFor(other, projectId)).toBeNull();
    expect(await results.projectResultsFor(me, 0)).toBeNull();
    expect(await results.projectResultsFor(me, 1.5)).toBeNull();
    expect(await results.projectResultsFor(me, projectId + 999)).toBeNull();
  });

  it("the page 404s for a non-owner and for a malformed id", async () => {
    const { default: Page } = await import("@/app/(dashboard)/ops/results/[id]/page");
    h.userId = other;
    await expect(Page({ params: Promise.resolve({ id: String(projectId) }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    h.userId = me;
    await expect(Page({ params: Promise.resolve({ id: "1e3" }) })).rejects.toThrow(/404/);
    const el = await Page({ params: Promise.resolve({ id: String(projectId) }) });
    expect((el.props as { data: { project: { id: number } } }).data.project.id).toBe(projectId);
  }, 60_000);
});
