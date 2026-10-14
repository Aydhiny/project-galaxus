// @vitest-environment node
//
// The Outreach bridge against a REAL Postgres (PGlite) with the app's schema and
// the production migration statements: lead sheets from Ops missions/projects
// becoming Outreach leads (deduped), demo-site copy written by a free model (or
// the template), and CompanyWall facts folded into the score. The only stand-ins
// are the outside HTTP services (a free LLM provider, CompanyWall, Jina, Exa):
// tests have no network, so `fetch` answers like those services do.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

process.env.AUTH_SECRET ||= "test-secret-for-crypto-box";
const client = new PGlite();
const testDb = drizzle(client, { schema });
const h = vi.hoisted(() => ({
  calls: [] as { url: string; at: number }[],
  llm: (() => null) as () => string | null, // the model's answer, or null = no answer (HTTP 503)
  companyWall: "open" as "open" | "blocked",
  userId: 0,
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { void Promise.resolve().then(fn); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/auth-session", () => ({ requireUserId: async () => { if (!h.userId) throw new Error("Not authenticated."); return h.userId; } }));

const bridge = await import("@/lib/services/outreach-bridge");
const free = await import("@/lib/services/free-llm");
const auto = await import("@/lib/services/leads-auto");
const actions = await import("@/lib/actions/ops");
const { leads, opsMissions, opsProjects, users } = schema;

const largePage = readFileSync("lib/__fixtures__/companywall-large.txt", "utf8");
const asHtml = (text: string) => `<html><body>${text.split("\n").map((l) => `<div>${l}</div>`).join("")}</body></html>`;

async function fakeFetch(input: RequestInfo | URL) {
  const url = String(input instanceof Request ? input.url : input);
  h.calls.push({ url, at: Date.now() });
  if (url.endsWith("/chat/completions")) {
    const text = h.llm();
    return text == null
      ? new Response("overloaded", { status: 503 })
      : new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { total_tokens: 300 } }), { headers: { "content-type": "application/json" } });
  }
  if (url.includes("companywall.ba") || url.startsWith("https://r.jina.ai/") || url === "https://mcp.exa.ai/mcp") {
    if (h.companyWall === "blocked") return new Response("Forbidden", { status: 403 });
    if (url.startsWith("https://www.companywall.ba/pretraga")) {
      const n = new URL(url).searchParams.get("n") ?? "";
      const hits = /bingo/i.test(n) ? '<a href="/firma/bingo-doo-tuzla/MMxIfTs0">BINGO</a><a href="/firma/aras-doo/MMEIcSGq">ARAS</a>' : '<a href="/firma/aras-doo/MMEIcSGq">ARAS</a>';
      return new Response(`<html><body>${hits}</body></html>`, { headers: { "content-type": "text/html" } });
    }
    if (url === "https://www.companywall.ba/firma/bingo-doo-tuzla/MMxIfTs0") return new Response(asHtml(largePage), { headers: { "content-type": "text/html" } });
  }
  return new Response("not found", { status: 404 });
}

let me = 0, sara = 0;
const today = new Date().toISOString().slice(0, 10);
const TABLE = (rows: string[]) =>
  ["Here are the dentists.", "", "| Name | Category | Address | Phone | WhatsApp | Email | Website | Website status | Source |", "|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
const leadsOf = (userId: number) => testDb.select().from(leads).where(eq(leads.userId, userId)).orderBy(leads.id);

beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin", email: "ajdin@example.test" }).returning())[0].id;
  sara = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("Send to Outreach", () => {
  it("a mission's lead sheet becomes Outreach leads, mapped and deduped; a second click adds nothing", async () => {
    // Already in Outreach from its own search: same clinic, different listing id.
    await testDb.insert(leads).values({ userId: me, placeId: "ChIJ-google-1", name: "SMILE d.o.o.", city: "Sarajevo" });
    const [m] = await testDb.insert(opsMissions).values({
      userId: me, day: today, title: "Find dentists in Sarajevo", brief: "FIND: dentist @ Sarajevo", status: "submitted",
      deliverable: TABLE([
        "| Dental Lana | Dentists | Ferhadija 5, Sarajevo | 061 123 456 | yes | info@lana.ba | | No website | OSM (https://www.openstreetmap.org/node/111) |",
        "| Smile | Dentists | Titova 1, Sarajevo | +387 33 222 333 | no | | | No website | |",
        "| Ordinacija Zub | Dentists | Titova 9, Sarajevo | 033 444 555 | no | | https://facebook.com/zub | Only Facebook/Instagram | |",
        "| Dr. Hodžić | Dentists | Sarajevo | | | | hodzic.ba | Not mobile-friendly | |",
      ]),
    }).returning();

    h.userId = me;
    const r = await actions.sendToOutreach({ missionId: m.id });
    expect(r).toEqual({ ok: true, data: { added: 3, skipped: 1 } }); // "Smile" is the same business as the existing lead
    const rows = (await leadsOf(me)).filter((l) => l.tags.includes("ops"));
    expect(rows.map((l) => l.name)).toEqual(["Dental Lana", "Ordinacija Zub", "Dr. Hodžić"]);
    expect(rows[0]).toMatchObject({
      placeId: "osm:node/111", phone: "+38761123456", channel: "whatsapp", city: "Sarajevo", category: "Dentists", status: "new",
      address: "Ferhadija 5, Sarajevo", website: null, mapsUrl: "https://www.openstreetmap.org/node/111", tags: ["ops"],
    });
    expect(rows[0].notes).toContain("Website status: No website");
    expect(rows[1]).toMatchObject({ phone: "+38733444555", channel: "call", website: "https://facebook.com/zub" });
    expect(rows[2]).toMatchObject({ website: "https://hodzic.ba", address: null, phone: null });
    expect(rows[2].placeId).toMatch(/^ops:/);

    expect(await bridge.sendToOutreachFor(me, { missionId: m.id })).toEqual({ added: 0, skipped: 4 });
  });

  it("a whole project's sheet: every mission's table, each with its own city; someone else's mission is out of reach", async () => {
    const [p] = await testDb.insert(opsProjects).values({ userId: me, title: "200 leads", goal: "Find leads", startDay: today, deadline: today }).returning();
    await testDb.insert(opsMissions).values([
      { userId: me, day: today, projectId: p.id, title: "Tuzla", brief: "FIND: hairdresser @ Tuzla", status: "done", deliverable: TABLE(["| Salon Lana | Hair | Trg 1 | 062 111 222 | yes | | | No website | |"]) },
      // Same name, different city: a different business.
      { userId: me, day: today, projectId: p.id, title: "Mostar", brief: "FIND: hairdresser @ Mostar", status: "submitted", deliverable: TABLE(["| Salon Lana | Hair | Kneza 2 | 063 111 222 | yes | | | No website | |"]) },
      { userId: me, day: today, projectId: p.id, title: "Open", status: "open", deliverable: null },
    ]);
    expect(await bridge.sendToOutreachFor(me, { projectId: p.id })).toEqual({ added: 2, skipped: 0 });
    expect((await leadsOf(me)).filter((l) => l.name === "Salon Lana").map((l) => l.city).sort()).toEqual(["Mostar", "Tuzla"]);

    const [theirs] = await testDb.insert(opsMissions).values({ userId: sara, day: today, title: "x", deliverable: TABLE(["| A | B | C | 061 000 000 | | | | | |"]) }).returning();
    await expect(bridge.sendToOutreachFor(me, { missionId: theirs.id })).rejects.toThrow("Mission not found.");
    const [prose] = await testDb.insert(opsMissions).values({ userId: me, day: today, title: "essay", deliverable: "Just words, no table." }).returning();
    await expect(bridge.sendToOutreachFor(me, { missionId: prose.id })).rejects.toThrow(/no business table/);
  });
});

describe("demo-site copy", () => {
  it("no free model → the template; a lead with a real website gets none; the public demo page gets the copy", async () => {
    const r = await bridge.writeDemoCopyFor(me, { limit: 2 });
    expect(r).toEqual({ written: 2, model: 0, template: 2 });
    const rows = (await leadsOf(me)).filter((l) => l.tags.includes("ops"));
    expect(rows.find((l) => l.name === "Dental Lana")!.demoContent).toMatchObject({ by: "template", hours: null, cta: "Zakažite pregled" });
    expect(rows.find((l) => l.name === "Dr. Hodžić")!.demoContent).toBeNull(); // has a website: never

    const lana = rows.find((l) => l.name === "Dental Lana")!;
    await testDb.update(leads).set({ status: "ready", demoSlug: "lanademo01" }).where(eq(leads.id, lana.id));
    const demo = await auto.demoBySlug("lanademo01");
    expect(demo?.content?.headline).toBe("Dental Lana — Stomatološke usluge, Sarajevo");
  });

  it("a free model writes it when one is available; a reply that invents facts falls back to the template", async () => {
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_test_1234567890", model: "llama-3.3-70b-versatile" });
    const replies = [
      '```json\n{"headline":"Salon Lana u Tuzli","services":[{"title":"Šišanje","text":"Za žene i muškarce."},{"title":"Bojenje","text":"Boja po želji."},{"title":"Njega","text":"Njega kose."}],"about":"Salon u Tuzli. Javite nam se.","cta":"Rezervišite termin"}\n```',
      '{"headline":"Najbolji salon od 1998.","services":[{"title":"a","text":"b"},{"title":"c","text":"d"},{"title":"e","text":"f"}],"about":"x","cta":"y"}',
    ];
    h.llm = () => replies.shift() ?? null;
    const r = await bridge.writeDemoCopyFor(me, { limit: 5 });
    expect(r).toMatchObject({ model: 1, template: 1 }); // the two salons left: one written by the model, one reply rejected
    const salons = (await leadsOf(me)).filter((l) => l.name === "Salon Lana");
    const byModel = salons.find((l) => l.demoContent?.by.includes("llama"));
    expect(byModel?.demoContent).toMatchObject({ headline: "Salon Lana u Tuzli", cta: "Rezervišite termin" });
    expect(salons.find((l) => l !== byModel)?.demoContent?.by).toBe("template");
  });
});

describe("CompanyWall", () => {
  it("fills revenue, employees and status for a match, records a no-match, and the score puts money + bad website first", async () => {
    const [bingo] = await testDb.insert(leads).values({ userId: me, placeId: "ops:bingo", name: "Bingo", city: "Tuzla", tags: ["ops"], gaps: ["no_website"], channel: "whatsapp" }).returning();
    // Earlier ops leads are checked first; cap the beat at 10 so this one is reached.
    h.calls = [];
    const r = await bridge.checkCompanyWallFor(me, { limit: 10, gapMs: 30 });
    expect(r.found).toBe(1);
    expect(r.noMatch).toBe(r.checked - 1);
    const [b] = await testDb.select().from(leads).where(eq(leads.id, bingo.id));
    expect(b.companyWall).toMatchObject({ result: "ok", employees: 8370, foundedYear: 2001, active: true, url: "https://www.companywall.ba/firma/bingo-doo-tuzla/MMxIfTs0" });
    expect(b.revenueKm).toBe(2_000_000_000);
    const others = (await leadsOf(me)).filter((l) => l.tags.includes("ops") && l.id !== b.id);
    expect(others.every((l) => l.companyWall?.result === "no_match")).toBe(true);
    expect(b.score).toBeGreaterThan(Math.max(...others.map((l) => l.score)));
    // Polite: one request at a time, spaced out.
    const cw = h.calls.filter((c) => c.url.includes("companywall.ba"));
    for (let i = 1; i < cw.length; i++) expect(cw[i].at - cw[i - 1].at).toBeGreaterThanOrEqual(25);
    // Each lead is looked up once.
    expect(await bridge.checkCompanyWallFor(me, { gapMs: 0 })).toEqual({ checked: 0, found: 0, noMatch: 0, blocked: 0 });
  });

  it("a hand-typed revenue wins; when CompanyWall blocks us it's recorded and the beat stops", async () => {
    const [a, b] = await testDb.insert(leads).values([
      { userId: me, placeId: "ops:blocked-1", name: "Bingo Market", city: "Tuzla", tags: ["ops"], revenueKm: 50_000 },
      { userId: me, placeId: "ops:blocked-2", name: "Another Shop", city: "Tuzla", tags: ["ops"] },
    ]).returning();
    h.companyWall = "blocked";
    const r = await bridge.checkCompanyWallFor(me, { gapMs: 0 });
    expect(r).toEqual({ checked: 1, found: 0, noMatch: 0, blocked: 1 });
    const [ra] = await testDb.select().from(leads).where(eq(leads.id, a.id));
    expect(ra.companyWall).toMatchObject({ result: "blocked" });
    expect(ra.companyWall?.error).toBeTruthy();
    expect(ra.revenueKm).toBe(50_000);
    const [rb] = await testDb.select().from(leads).where(eq(leads.id, b.id));
    expect(rb.companyWall).toBeNull(); // not touched: we stopped at the wall
    h.companyWall = "open";
  });
});
