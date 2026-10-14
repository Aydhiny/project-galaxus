// @vitest-environment node
//
// Replies & friends against a REAL Postgres (PGlite) with the app's schema and the
// production migration statements:
//   • reply watch — a lead replies (Outreach, an email from their domain), the Chief
//     drafts a reply + quote (free model ▸ Claude on the runner ▸ template) and asks in
//     the Ops inbox; your answer puts the draft in the lead, reprices it, or leaves it;
//   • the shared lead pool — two linked users who both opt in never contact the same
//     business twice, and neither sees the other's notes or messages.
// The only stand-ins are the outside HTTP services (free LLM provider, GitHub dispatch).

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
  reply: (() => ({ status: 200, text: "ok" })) as (url: string) => { status: number; text: string },
}));
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (fn: () => unknown) => { h.pending.push(Promise.resolve().then(fn)); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const ops = await import("@/lib/services/ops");
const inbox = await import("@/lib/services/ops-inbox");
const links = await import("@/lib/services/ops-links");
const free = await import("@/lib/services/free-llm");
const tokens = await import("@/lib/services/api-tokens");
const voice = await import("@/lib/services/voice");
const engine = await import("@/lib/services/outreach/engine");
const watch = await import("@/lib/services/reply-watch");
const pool = await import("@/lib/services/lead-pool");
const deals = await import("@/lib/services/deals");
const { users, leads, leadReplies, opsMessages, outreachSettings, voiceCommands } = schema;

const settle = async () => { while (h.pending.length) await h.pending.shift(); };
const llm = (content: string) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 300 } }) });
const llmCalls = () => h.calls.filter((c) => c.url.endsWith("/chat/completions"));
const lead = async (id: number) => (await testDb.select().from(leads).where(eq(leads.id, id)))[0];
const draftsOf = (leadId: number) => testDb.select().from(leadReplies).where(eq(leadReplies.leadId, leadId));
const message = async (id: number) => (await testDb.select().from(opsMessages).where(eq(opsMessages.id, id)))[0];
let seq = 0;
async function addLead(userId: number, over: Partial<typeof leads.$inferInsert> = {}) {
  const [row] = await testDb.insert(leads).values({
    userId, placeId: `test:${++seq}`, name: `Dental Studio ${seq}`, city: "Sarajevo", phone: `+3876${1_000_000 + seq}`, channel: "whatsapp",
    gaps: ["no_website"], status: "sent", sentAt: new Date(), message: "Dobar dan! Ja sam Ajdin, pravim web stranice za ordinacije u Sarajevu.", ...over,
  }).returning();
  return row;
}

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : "";
  h.calls.push({ url, body });
  if (url.endsWith("/chat/completions")) {
    const r = h.reply(url);
    return new Response(r.text, { status: r.status, headers: { "content-type": "application/json" } });
  }
  return new Response("not found", { status: 404 });
}

async function runJob(userId: number, answer: string) {
  const job = await voice.claimNextFor(userId);
  if (!job) throw new Error("no job queued");
  await voice.completeFor(userId, job.id, { ok: true, summary: answer, costCents: 2 });
  return job;
}

let me = 0, sara = 0, faruk = 0;
beforeAll(async () => {
  const { pushSchema } = await import("drizzle-kit/api");
  await (await pushSchema(schema, testDb as never)).apply();
  const src = readFileSync("scripts/ensure-schema.mjs", "utf8");
  const block = src.slice(src.indexOf("// ── 2026-10 · Ops (agent facility)"), src.indexOf("// Housekeeping"));
  for (const st of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1])) await client.exec(st);
  me = (await testDb.insert(users).values({ name: "Ajdin Mehmedović", email: "ajdin@example.test" }).returning())[0].id;
  sara = (await testDb.insert(users).values({ name: "Sara", email: "sara@example.test" }).returning())[0].id;
  faruk = (await testDb.insert(users).values({ name: "Faruk Hadžić", email: "faruk@example.test" }).returning())[0].id;
  vi.stubGlobal("fetch", fakeFetch);
}, 120_000);

describe("reply watch", () => {
  it("a lead marked replied: the Chief drafts on a free model with your offer's price and asks you; 'Use this reply' puts it in the lead", async () => {
    await testDb.insert(outreachSettings).values({ userId: me, offer: "Web stranice od 900 KM, gotove za dvije sedmice", senderName: "Ajdin" });
    await free.saveFreeKeyFor(me, { provider: "groq", key: "gsk_test_1234567890", model: "llama-3.3-70b-versatile" });
    const { agent: chief } = await ops.createAgentFor(me, { name: "Atlas", role: "chief", provider: "claude", cloud: true });
    const draft = "Hvala Vam na odgovoru! Za Vašu ordinaciju mogu uraditi novu web stranicu za 900 KM. Da li Vam odgovara kratak poziv ove sedmice?";
    h.reply = () => llm(JSON.stringify({ language: "bcs", reply: draft, quoteKm: 900 }));
    const l = await addLead(me);

    await engine.updateLeadFor(me, l.id, { status: "replied" });
    await settle();

    const [d] = await draftsOf(l.id);
    expect(d).toMatchObject({ status: "asked", engine: "free", quoteKm: 900, lang: "bcs", reply: draft });
    const q = await message(d.messageId!);
    expect(q).toMatchObject({ kind: "question", toUser: true, fromAgentId: chief.id, options: ["Use this reply", "Change the price", "Not now"] });
    expect(q.body).toContain(`${l.name} replied. Suggested quote: 900 KM (a new website)`);
    expect(q.body).toContain("Hvala Vam na odgovoru!");
    // What the free model was asked: the price from your offer, the business, and our first message.
    const sent = JSON.parse(llmCalls().at(-1)!.body) as { messages: { content: string }[] };
    expect(sent.messages[1].content).toContain("Price to quote: 900 KM");
    expect(sent.messages[1].content).toContain("Dobar dan! Ja sam Ajdin");
    expect((await lead(l.id)).message).toContain("Dobar dan!"); // nothing changes until you answer

    await inbox.answerFor(me, q.id, "Use this reply");
    const after = await lead(l.id);
    expect(after.message).toBe(draft);
    expect(after.tags).toContain("reply_ready");
    expect(after.status).toBe("replied"); // never "sent" by itself
    expect((await draftsOf(l.id))[0].status).toBe("used");
    // The inbox's own behaviour is unchanged: the answer is stored and the Chief hears it on its radio.
    expect(await message(q.id)).toMatchObject({ answer: "Use this reply" });
    const radio = await testDb.select().from(opsMessages).where(and(eq(opsMessages.userId, me), eq(opsMessages.toAgentId, chief.id)));
    expect(radio.some((m) => m.body.includes("Use this reply"))).toBe(true);
  });

  it("one open draft per lead: marking it replied again doesn't ask twice", async () => {
    const l = await addLead(me);
    await engine.updateLeadFor(me, l.id, { status: "replied" });
    await engine.updateLeadFor(me, l.id, { status: "sent" });
    await engine.updateLeadFor(me, l.id, { status: "replied" });
    await settle();
    expect(await draftsOf(l.id)).toHaveLength(1);
  });

  it("an email from the lead's own domain counts as their reply, in their language (English here)", async () => {
    h.reply = () => llm(JSON.stringify({ language: "en", reply: "Thank you for getting back to me! A new website would be 900 KM. Would a short call this week work?", quoteKm: 900 }));
    const l = await addLead(me, { website: "https://www.smile-clinic.ba" });
    await watch.onEmailReply(me, "info@smile-clinic.ba", "Hi, how much would a website cost for us?");
    await settle();
    expect(await lead(l.id)).toMatchObject({ status: "replied" });
    const [d] = await draftsOf(l.id);
    expect(d).toMatchObject({ status: "asked", lang: "en", theirText: "Hi, how much would a website cost for us?" });
    expect((await message(d.messageId!)).body).toContain('They wrote: "Hi, how much would a website cost for us?"');
    // Free mail never matches a lead.
    expect(await watch.onEmailReply(me, "someone@gmail.com", "hello")).toBeNull();
  });

  it("their reply pasted in the Deal Desk starts the watch too", async () => {
    const l = await addLead(me);
    await deals.logTheirReplyFor(me, `lead:${l.id}`, "Zanima nas, koliko bi to koštalo?");
    await settle();
    expect((await lead(l.id)).status).toBe("replied");
    expect((await draftsOf(l.id))[0]).toMatchObject({ status: "asked", theirText: "Zanima nas, koliko bi to koštalo?" });
  });

  it("past the daily cap on model drafts, the template asks instead (no model call)", async () => {
    const extra = await addLead(me);
    await testDb.insert(leadReplies).values(Array.from({ length: 8 }, () => ({ userId: me, leadId: extra.id, status: "dismissed", engine: "free" })));
    const calls = llmCalls().length;
    const l = await addLead(me);
    await engine.updateLeadFor(me, l.id, { status: "replied" });
    await settle();
    expect(llmCalls().length).toBe(calls);
    const [d] = await draftsOf(l.id);
    expect(d).toMatchObject({ status: "asked", engine: "template", quoteKm: 900 });
    expect(d.reply).toContain("900 KM");
  });

  it("no agents and no engine: Galaxus asks with the template; 'Change the price' asks for a new one and reprices the draft", async () => {
    const l = await addLead(sara, { name: "Frizerski salon Lana", gaps: ["no_booking"] });
    await engine.updateLeadFor(sara, l.id, { status: "replied" });
    await settle();
    const [d] = await draftsOf(l.id);
    expect(d).toMatchObject({ status: "asked", engine: "template", quoteKm: 750 }); // half of the 1500 KM default: booking only
    const q = await message(d.messageId!);
    expect(q.fromAgentId).toBeNull();
    expect((await inbox.inboxFor(sara)).find((m) => m.id === q.id)?.agent).toBe("Galaxus");

    await inbox.answerFor(sara, q.id, "Change the price");
    const [d2] = await draftsOf(l.id);
    expect(d2.status).toBe("repricing");
    const follow = await message(d2.messageId!);
    expect(follow.body).toContain("New price for Frizerski salon Lana?");
    expect(follow.options).toEqual(["600 KM", "750 KM", "900 KM"]);

    await inbox.answerFor(sara, follow.id, "600 KM");
    const after = await lead(l.id);
    expect(after.message).toContain("600 KM");
    expect(after.message).not.toContain("750 KM");
    expect((await draftsOf(l.id))[0]).toMatchObject({ status: "used", quoteKm: 600 });
  });

  it("Claude on the runner drafts when no free model can; 'Not now' leaves the lead alone; an unreadable answer falls back to the template", async () => {
    await tokens.createApiTokenFor(faruk, "Runner", "voice");
    const l = await addLead(faruk);
    await engine.updateLeadFor(faruk, l.id, { status: "replied" });
    await settle();
    expect((await draftsOf(l.id))[0]).toMatchObject({ status: "drafting", engine: "claude" });
    await runJob(faruk, JSON.stringify({ language: "bcs", reply: "Hvala Vam! Nova web stranica je 1500 KM, a gotova je za dvije sedmice. Može poziv u četvrtak?", quoteKm: 1500 }));
    expect((await testDb.select().from(voiceCommands).where(eq(voiceCommands.userId, faruk)))[0]).toMatchObject({ kind: "ops_lead_reply", status: "done" });
    const [d] = await draftsOf(l.id);
    expect(d).toMatchObject({ status: "asked", engine: "claude", quoteKm: 1500 });
    await inbox.answerFor(faruk, d.messageId!, "Not now");
    expect((await draftsOf(l.id))[0].status).toBe("dismissed");
    expect((await lead(l.id)).message).toContain("Dobar dan!");

    const l2 = await addLead(faruk);
    await engine.updateLeadFor(faruk, l2.id, { status: "replied" });
    await settle();
    await runJob(faruk, "Sorry, I can't help with that.");
    const [failed] = await testDb.select().from(voiceCommands).where(and(eq(voiceCommands.userId, faruk), eq(voiceCommands.kind, "ops_lead_reply"))).orderBy(voiceCommands.id).offset(1);
    expect(failed.status).toBe("failed");
    expect((await draftsOf(l2.id))[0]).toMatchObject({ status: "asked", engine: "template" });
  });
});

describe("shared lead pool", () => {
  let a = 0, f = 0, linkId = 0;
  beforeAll(async () => {
    a = (await testDb.insert(users).values({ name: "Ajdin Pool", email: "ajdin.pool@example.test" }).returning())[0].id;
    f = (await testDb.insert(users).values({ name: "Faruk Pool", email: "faruk.pool@example.test" }).returning())[0].id;
    linkId = (await links.inviteLinkFor(a, "faruk.pool@example.test", false))!.id;
    await links.respondLinkFor(f, linkId, true, false);
    // Faruk already messaged Smile on 12 Oct, and has Dental Art in today's list. His notes are private.
    await testDb.insert(leads).values([
      { userId: f, placeId: "f:1", name: "Stomatološka ordinacija Smile d.o.o.", city: "Sarajevo", phone: "+38761111222", status: "sent", sentAt: new Date("2026-10-12T09:00:00Z"), message: "SECRET MESSAGE FROM FARUK", notes: "SECRET NOTE: owner is my cousin" },
      { userId: f, placeId: "f:2", name: "Dental Art", city: "Sarajevo", phone: "+38762333444", status: "queued", queuedFor: "2026-10-15", notes: "SECRET NOTE 2" },
    ]);
  });

  it("is off by default, and stays off until BOTH sides opt in", async () => {
    expect((await links.linksFor(a))[0]).toMatchObject({ youShareLeads: false, theyShareLeads: false });
    const r = await engine.importLeadsFor(a, "Smile, 061 111 222", { city: "Sarajevo" });
    expect(r.added).toBe(1);
    const [first] = await testDb.select().from(leads).where(eq(leads.userId, a));
    expect(first).toMatchObject({ status: "new", partnerNote: null });

    await pool.setLinkLeadsFor(a, linkId, true);
    expect(await pool.poolPartnersFor(a)).toEqual([]);
    expect((await links.linksFor(f))[0]).toMatchObject({ youShareLeads: false, theyShareLeads: true });
    await pool.setLinkLeadsFor(f, linkId, true);
    expect(await pool.poolPartnersFor(a)).toEqual([f]);
    expect(await pool.poolPartnersFor(f)).toEqual([a]);
    await testDb.delete(leads).where(eq(leads.userId, a));
  });

  it("imported leads Faruk already contacted go in skipped, with who and when — never his notes or messages", async () => {
    await engine.importLeadsFor(a, "Stomatološka ordinacija Smile, 033 999 999\nOrdinacija Novi Osmijeh, 061 555 666\nRandom Shop, 062 333 444", { city: "Sarajevo" });
    const mine = await testDb.select().from(leads).where(eq(leads.userId, a)).orderBy(leads.id);
    expect(mine.map((l) => [l.name, l.status, l.skipReason, l.partnerNote])).toEqual([
      ["Stomatološka ordinacija Smile", "skipped", "partner_contacted", "Faruk contacted this on 12 Oct"], // same business key and city
      ["Ordinacija Novi Osmijeh", "new", null, null],
      ["Random Shop", "skipped", "partner_contacted", "Faruk has this in their send list for 15 Oct"], // same phone as his Dental Art
    ]);
    expect(JSON.stringify(mine)).not.toContain("SECRET");
  });

  it("never queues what the partner has: the daily release skips it and takes the next one; queueing by hand is refused", async () => {
    const [dup] = await testDb.insert(leads).values({ userId: a, placeId: "a:dup", name: "Dental Art", city: "Sarajevo", phone: null, status: "ready", score: 99, message: "Dobar dan" }).returning();
    const [ok] = await testDb.insert(leads).values({ userId: a, placeId: "a:ok", name: "Fresh Clinic", city: "Sarajevo", phone: "+38761777888", status: "ready", score: 10, message: "Dobar dan" }).returning();
    expect(await engine.releaseBatchFor(a, 1, "2026-10-15", 1)).toBe(1);
    expect(await lead(dup.id)).toMatchObject({ status: "skipped", partnerNote: "Faruk has this in their send list for 15 Oct", queuedFor: null });
    expect(await lead(ok.id)).toMatchObject({ status: "queued", queuedFor: "2026-10-15" });

    await testDb.update(leads).set({ status: "ready", skipReason: null, partnerNote: null }).where(eq(leads.id, dup.id));
    await expect(engine.updateLeadFor(a, dup.id, { status: "queued" })).rejects.toThrow("Faruk has this in their send list for 15 Oct");
    // A send that already happened is kept, with the note so you see it.
    await engine.updateLeadFor(a, dup.id, { status: "sent" });
    expect(await lead(dup.id)).toMatchObject({ status: "sent", partnerNote: "Faruk has this in their send list for 15 Oct" });
  });

  it("works both ways: Faruk's new leads skip what Ajdin contacted", async () => {
    await engine.importLeadsFor(f, "Fresh Clinic, 061 777 888", { city: "Sarajevo" });
    const [l] = await testDb.select().from(leads).where(and(eq(leads.userId, f), eq(leads.name, "Fresh Clinic")));
    expect(l).toMatchObject({ status: "skipped", partnerNote: "Ajdin has this in their send list for 15 Oct" });
  });

  it("turning it off on either side stops the pool", async () => {
    await pool.setLinkLeadsFor(f, linkId, false);
    expect(await pool.poolPartnersFor(a)).toEqual([]);
    const [l] = await testDb.insert(leads).values({ userId: a, placeId: "a:after", name: "Smile", city: "Sarajevo", status: "ready", message: "x" }).returning();
    await engine.updateLeadFor(a, l.id, { status: "queued" });
    expect((await lead(l.id)).status).toBe("queued");
  });
});
