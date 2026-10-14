// @vitest-environment node
//
// Learning & progress against a REAL Postgres (PGlite) with the app's schema and the
// production migration statements (same harness as ops-round3.db.test.ts):
//   * cost per lead: free runs counted on the mission, qualified rows and Outreach replies,
//   * learning: skipping / advancing leads and accepting / sending back missions become
//     one "preference" memory per category + website status, and the finder ranks by them,
//   * progress: the project card's "3 / 10 leads" and the Chief judging against the number.
// The only stand-ins are the outside HTTP services (maps, websites, Exa, the free model).

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, like } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
const client = new PGlite();
const testDb = drizzle(client, { schema });
const h = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  calls: [] as { url: string; body: string }[],
  reply: (() => ({ status: 200, text: "ok" })) as (url: string) => { status: number; text: string; headers?: Record<string, string> },
  web: (() => null) as (url: string, body: string) => Response | null,
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const projects = await import("@/lib/services/ops-projects");
const free = await import("@/lib/services/free-llm");
const mem = await import("@/lib/services/ops-memory");
const engine = await import("@/lib/services/outreach/engine");
const finder = await import("@/lib/services/business-finder");
const costs = await import("@/lib/services/ops-costs");
const { opsMissions, opsMemories, leads, users } = schema;

const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 420 } }) });
const prefs = (userId: number) => testDb.select().from(opsMemories).where(and(eq(opsMemories.userId, userId), like(opsMemories.source, "pref:%")));

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
  h.calls.push({ url, body });
  const custom = h.web(url, body);
  if (custom) return custom;
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }
  if (url === "https://mcp.exa.ai/mcp") return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "" }] } })}\n\n`);
  return new Response("not found", { status: 404 });
}

// The outside world for "dentists in Sarajevo": the map, one website, a Facebook page found by Exa.
const html = (body: string) => new Response(`<html><body>${body}${" Ordinacija u centru Sarajeva, radno vrijeme 8-20.".repeat(6)}</body></html>`, { headers: { "content-type": "text/html" } });
const maps = (url: string, body: string) => {
  if (url.startsWith("https://nominatim.openstreetmap.org/")) return Response.json([{ boundingbox: ["43.80", "43.90", "18.30", "18.45"] }]);
  if (url.includes("overpass")) return Response.json({ elements: [
    { type: "node", id: 1, tags: { name: "Stomatologija Ćiro", "addr:street": "Ferhadija", "addr:housenumber": "3", website: "https://ciro-dental.example" } },
    { type: "node", id: 2, tags: { name: "Zubić Vila", phone: "061 234 567" } },
    { type: "node", id: 3, tags: { name: "Dental Pro" } },
  ] });
  if (url.replace(/\/$/, "") === "https://ciro-dental.example") return html('<a href="tel:+38761999888">Pozovite</a> <a href="mailto:info@ciro-dental.example">email</a>');
  if (url === "https://mcp.exa.ai/mcp" && body.includes("Dental Pro")) {
    const text = "Title: Dental Pro Sarajevo | Facebook\nURL: https://www.facebook.com/dentalpro.sa\nHighlights:\nDental Pro";
    return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`);
  }
  if (url === "https://www.facebook.com/dentalpro.sa") return html("Kontakt: 062 777 888, dentalpro@gmail.com");
  return null;
};

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

const newUser = async (name: string) => (await testDb.insert(users).values({ name, email: `${name.toLowerCase()}@example.test` }).returning())[0].id;
const newLead = async (userId: number, o: Partial<typeof leads.$inferInsert> & { name: string }) =>
  (await testDb.insert(leads).values({ userId, placeId: `p-${o.name}`, category: "Dentist", status: "ready", ...o }).returning())[0];

describe("learning from your decisions in Outreach", () => {
  it("skips become one preference memory per category + website status, undo takes one back, a reply moves it forward", async () => {
    const me = await newUser("Amra");
    const goodSite = { gaps: [] as string[], website: "https://good-dental.example" };
    const a = await newLead(me, { name: "Dental A", ...goodSite });
    const b = await newLead(me, { name: "Dental B", ...goodSite });
    const c = await newLead(me, { name: "Dental C", ...goodSite, category: "Dentists" }); // an Ops lead names it differently
    await engine.updateLeadFor(me, a.id, { status: "skipped", skipReason: "not_a_fit" });
    await engine.updateLeadFor(me, b.id, { status: "skipped", skipReason: "not_a_fit" });
    await engine.updateLeadFor(me, c.id, { status: "skipped", skipReason: "wrong_business" });

    let rows = await prefs(me);
    expect(rows).toHaveLength(1); // repeats update the same memory, never spam
    expect(rows[0]).toMatchObject({ type: "preference", source: "pref:dentist:good", title: "Skipped: dentists with a good website (3×)" });
    expect(rows[0].body).toContain('last skipped as "wrong business"');

    // Undo (the Outreach toast puts the old status back).
    await engine.updateLeadFor(me, c.id, { status: "ready" });
    rows = await prefs(me);
    expect(rows[0].title).toBe("Skipped: dentists with a good website (2×)");

    // The pipeline's own skips teach nothing; a reply on a no-website dentist is a step forward.
    const d = await newLead(me, { name: "Dental D", gaps: ["no_website"], status: "sent" });
    await engine.updateLeadFor(me, d.id, { status: "replied" });
    await engine.updateLeadFor(me, d.id, { status: "meeting" }); // still the same step forward, not another
    const noSite = (await prefs(me)).find((r) => r.source === "pref:dentist:none")!;
    expect(noSite.title).toBe("Moved forward: dentists with no website (1×)");

    // Agents see it: the memory brief for a dentist mission carries the preference.
    expect(await mem.memoryBrief(me, "find dentists in Sarajevo")).toContain("Skipped: dentists with a good website (2×)");
  });

  it("the business finder ranks with what was learned", async () => {
    const me = await newUser("Kenan");
    h.web = maps;
    const before = await finder.findBusinessesFor(me, "dentist", "Sarajevo", { limit: 10, deadlineMs: 30_000 });
    expect(before.rows.map((r) => r.name)).toEqual(["Zubić Vila", "Dental Pro", "Stomatologija Ćiro"]); // need first: no website, Facebook only, weak

    // Kenan keeps skipping dentists with no website.
    for (const n of ["X", "Y", "Z"]) {
      const l = await newLead(me, { name: `No-site ${n}`, gaps: ["no_website"] });
      await engine.updateLeadFor(me, l.id, { status: "skipped", skipReason: "not_a_fit" });
    }
    const after = await finder.findBusinessesFor(me, "dentist", "Sarajevo", { limit: 10, deadlineMs: 30_000 });
    expect(after.rows.map((r) => r.name)).toEqual(["Dental Pro", "Zubić Vila", "Stomatologija Ćiro"]);
    h.web = () => null;
  });
});

describe("a lead-finding project: free runs, progress against the number, the Chief, learning from your review, cost per lead", () => {
  it("works end to end", async () => {
    const me = await newUser("Lejla");
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_lejla_1234567890", model: "openai/gpt-oss-120b" });
    const { agent: lead } = await ops.createAgentFor(me, { name: "Chiefy", role: "chief", provider: "claude", cloud: true, engine: "free" });
    const { agent: scout } = await ops.createAgentFor(me, { name: "Testy", role: "scout", provider: "claude", cloud: true, engine: "free" });
    // A preference learned earlier (Outreach): the planner must see it even though the goal says "leads", not "dentists".
    const old = await newLead(me, { name: "Old Dental", gaps: [], website: "https://old.example" });
    await engine.updateLeadFor(me, old.id, { status: "skipped", skipReason: "not_a_fit" });

    h.web = maps;
    const prompts: { system: string; prompt: string }[] = [];
    h.reply = () => {
      const body = JSON.parse(h.calls.at(-1)!.body) as { messages: { content: string }[] };
      const [system, prompt] = [body.messages[0].content, body.messages[1].content];
      prompts.push({ system, prompt });
      if (system.includes("coordinating a small crew")) return llm(JSON.stringify({
        plan: "Dentists first.", message: "Testy: dentists.",
        missions: [{ title: "Dentists in Sarajevo", brief: "FIND: dentist @ Sarajevo\n10 rows", agent: "Testy", role: "scout", kind: "research", effort: "quick", due_in_days: 0 }],
      }));
      if (system.startsWith("You are the Chief of staff")) return llm(JSON.stringify({ verdict: "accept", progress: 30, note: "Real dentists with contacts.", feedback: "Good." }));
      return llm("unexpected");
    };

    const p = await projects.createProjectFor(me, { title: "Website leads", goal: "Find at least 10 leads that need a website in Sarajevo, with WhatsApp numbers and emails.", days: 3, leadAgentId: lead.id });
    await settle();

    // The planner saw the learned preference (stated outright, not left to the memory search).
    const plan = prompts.find((x) => x.system.includes("coordinating a small crew"))!;
    expect(plan.prompt).toContain("LEARNED FROM THE USER'S DECISIONS");
    expect(plan.prompt).toContain("Skipped: dentists with a good website (1×)");

    // The finder mission ran for $0 and counted one free run.
    const [m] = await testDb.select().from(opsMissions).where(eq(opsMissions.projectId, p.id));
    expect(m).toMatchObject({ status: "submitted", submittedBy: scout.id, spentCents: 0, freeCalls: 1 });

    // The Chief judged it against the number.
    const review = prompts.find((x) => x.system.startsWith("You are the Chief of staff"))!;
    expect(review.prompt).toContain("PROGRESS TOWARD THE TARGET: 3 / 10 leads · 3 WhatsApp · 2 emails in the merged sheet (30%). 7 still to go");

    // The card's live counter.
    const card = (await projects.projectsFor(me))[0];
    expect(card.progress).toEqual({ rows: 3, phones: 3, whatsapp: 3, emails: 2, target: 10, unit: "leads" });

    // You send it back, then accept it: both are remembered per category, as one memory.
    await ops.reopenMissionFor(me, m.id, "Only dentists in the centre, please");
    await testDb.update(opsMissions).set({ status: "submitted" }).where(eq(opsMissions.id, m.id)); // (the crew re-delivers)
    await ops.acceptMissionFor(me, m.id);
    const cat = (await prefs(me)).find((r) => r.source === "pref:dentist:any")!;
    expect(cat.body).toContain("[tally: skipped 0 · advanced 0 · accepted 1 · sent back 1]");
    expect(cat.body).toContain("Only dentists in the centre");

    // Cost per lead: 3 qualified rows, one free run, $0; then one of them (sent to Outreach, tagged "ops") replies.
    let c = await costs.leadCostsFor(me);
    expect(c.total).toMatchObject({ spentCents: 0, freeCalls: 1, qualified: 3, replies: 0, perQualifiedCents: 0, perReplyCents: null });
    expect(c.byAgent[scout.id]).toMatchObject({ qualified: 3, freeCalls: 1 });
    expect(c.byKind.research).toMatchObject({ qualified: 3 });
    await newLead(me, { name: "Zubić Vila", status: "replied", tags: ["ops"] });
    await newLead(me, { name: "Dental Pro", status: "replied" }); // not from Ops: doesn't count
    c = await costs.leadCostsFor(me);
    expect(c.total).toMatchObject({ qualified: 3, replies: 1, perReplyCents: 0 });

    // And the overview (what the scoreboard reads) carries it.
    const overview = await ops.opsOverviewFor(me);
    expect(overview.leadCosts.byAgent[scout.id]).toMatchObject({ qualified: 3, replies: 1 });
    h.web = () => null;
  }, 60_000);
});
