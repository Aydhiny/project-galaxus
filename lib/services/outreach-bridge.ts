// The bridge from Ops to Outreach:
//   1. "Send to Outreach": a mission's (or a whole project's) lead sheet → Outreach leads, deduped.
//   2. Demo-site copy for ops leads with no real website, written by a free model (template fallback).
//   3. CompanyWall: the public revenue / employees / founding / status of ops leads, folded into the score.
// Like the rest of Outreach, nothing here SENDS anything: it only prepares leads.

import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, opsMissions, opsProjects } from "@/lib/db/schema";
import { mergeTables } from "@/lib/ops";
import { bizKey, scoreLead } from "@/lib/outreach";
import { DEMO_SYSTEM, cleanDemoContent, demoPrompt, leadColumns, needsDemoCopy, opsRowToLead, templateDemo, type OpsLead } from "@/lib/outreach-bridge";
import { parseCompanyWall, pickFirmaLink, type CompanyWallInfo } from "@/lib/companywall";
import { parseFindLine } from "@/lib/services/business-finder";

const MAX_ROWS = 300;
const CLOSED = ["skipped", "not_interested", "do_not_contact"];

// ─── 1. Send to Outreach ──────────────────────────────────────────────────────

/** Lead rows from one mission's result, or every result in a project (each with the city its "FIND:" line names). */
async function opsLeadsFrom(userId: number, src: { missionId?: number; projectId?: number }): Promise<OpsLead[]> {
  let results: { id: number; brief: string | null; deliverable: string | null }[];
  if (src.projectId) {
    const [p] = await db.select({ id: opsProjects.id }).from(opsProjects).where(and(eq(opsProjects.id, src.projectId), eq(opsProjects.userId, userId))).limit(1);
    if (!p) throw new Error("Project not found.");
    results = await db.select({ id: opsMissions.id, brief: opsMissions.brief, deliverable: opsMissions.deliverable }).from(opsMissions)
      .where(and(eq(opsMissions.userId, userId), eq(opsMissions.projectId, p.id), inArray(opsMissions.status, ["done", "submitted"]), sql`${opsMissions.deliverable} is not null`))
      .orderBy(opsMissions.id);
  } else if (src.missionId) {
    results = await db.select({ id: opsMissions.id, brief: opsMissions.brief, deliverable: opsMissions.deliverable }).from(opsMissions)
      .where(and(eq(opsMissions.id, src.missionId), eq(opsMissions.userId, userId))).limit(1);
    if (!results.length) throw new Error("Mission not found.");
  } else throw new Error("Pick a mission or a project.");

  const out: OpsLead[] = [];
  let tables = 0;
  for (const r of results) {
    const [header, ...rows] = mergeTables([r.deliverable ?? ""]);
    const cols = header ? leadColumns(header) : null;
    if (!cols) continue;
    tables++;
    const city = parseFindLine(r.brief)?.city ?? null;
    for (const row of rows) {
      const l = opsRowToLead(cols, row, city, src.projectId ? `project #${src.projectId}, mission #${r.id}` : `mission #${r.id}`);
      if (l) out.push(l);
    }
  }
  if (!tables) throw new Error("There's no business table (Name + Phone/Website/Address) in this result.");
  return out.slice(0, MAX_ROWS);
}

/**
 * Add the sheet's businesses to Outreach as new leads (status "new": the
 * pipeline audits and drafts them like any other). Deduped the way Outreach
 * dedupes: same business name in the same city (bizKey), or the same placeId.
 */
export async function sendToOutreachFor(userId: number, src: { missionId?: number; projectId?: number }) {
  const found = await opsLeadsFrom(userId, src);
  const existing = await db.select({ name: leads.name, city: leads.city }).from(leads).where(eq(leads.userId, userId));
  const keyOf = (name: string, city: string | null) => `${bizKey(name)}|${(city ?? "").trim().toLowerCase()}`;
  const known = new Set(existing.map((e) => keyOf(e.name, e.city)));
  const knownAnyCity = new Set(existing.map((e) => bizKey(e.name)));
  const fresh: OpsLead[] = [];
  for (const l of found) {
    const k = keyOf(l.name, l.city);
    // No city on the sheet: any existing lead with that name counts as the same business.
    if (!bizKey(l.name) || known.has(k) || (!l.city && knownAnyCity.has(bizKey(l.name)))) continue;
    known.add(k);
    knownAnyCity.add(bizKey(l.name));
    fresh.push(l);
  }
  if (!fresh.length) return { added: 0, skipped: found.length };
  const inserted = await db.insert(leads)
    .values(fresh.map((l) => ({ ...l, userId, searchId: null, gaps: [], score: scoreLead({ gaps: [], channel: l.channel, tags: l.tags }) })))
    .onConflictDoNothing({ target: [leads.userId, leads.placeId] })
    .returning({ id: leads.id });
  return { added: inserted.length, skipped: found.length - inserted.length };
}

// ─── 2. Demo-site copy ────────────────────────────────────────────────────────

/**
 * Write demo-site copy for up to `limit` ops leads that have no real website.
 * Free models first (askFree); when none is available or the reply invents
 * facts, a deterministic template. Bounded by a deadline for the scheduler beat.
 */
export async function writeDemoCopyFor(userId: number, o: { limit?: number; deadlineMs?: number } = {}) {
  const deadline = Date.now() + (o.deadlineMs ?? 25_000);
  const rows = await db.select().from(leads)
    .where(and(eq(leads.userId, userId), isNull(leads.demoContent), sql`${leads.tags} @> '["ops"]'::jsonb`, notInArray(leads.status, CLOSED)))
    .orderBy(asc(leads.id)).limit(40);
  const todo = rows.filter(needsDemoCopy).slice(0, o.limit ?? 5);
  let model = 0, template = 0;
  const { askFree } = await import("@/lib/services/free-llm");
  const { parseJsonReply } = await import("@/lib/claude-jobs");
  let freeDown = false; // one "no free model" is enough for this beat
  for (const l of todo) {
    if (Date.now() > deadline) break;
    let content = null;
    if (!freeDown) {
      try {
        const r = await askFree(userId, { system: DEMO_SYSTEM, prompt: demoPrompt(l), maxTokens: 700, json: false });
        content = cleanDemoContent(parseJsonReply(r.text), l, `${r.name} · ${r.model}`);
      } catch { freeDown = true; }
    }
    if (content) model++; else { content = templateDemo(l); template++; }
    await db.update(leads).set({ demoContent: content, updatedAt: new Date() }).where(eq(leads.id, l.id));
  }
  return { written: model + template, model, template };
}

// ─── 3. CompanyWall ───────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (compatible; Galaxus/1.0; +https://project-galaxus.vercel.app)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CompanyWall's search, as HTML (hrefs intact); Reach (Jina keeps links as markdown) when the direct fetch is refused. */
async function searchPage(name: string) {
  const url = `https://www.companywall.ba/pretraga?${new URLSearchParams({ n: name.slice(0, 120) })}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (res.ok) return await res.text();
  } catch { /* fall through to Reach */ }
  const { reachRead } = await import("@/lib/services/reach");
  return (await reachRead(url, 60_000)).text;
}

/**
 * Look up to `limit` ops leads on CompanyWall, politely: one request at a time,
 * at least `gapMs` apart. Each lead is looked up once; a block or a missing
 * match is recorded on the lead, never retried in a loop.
 */
export async function checkCompanyWallFor(userId: number, o: { limit?: number; gapMs?: number; deadlineMs?: number } = {}) {
  const gap = o.gapMs ?? 4_000;
  const deadline = Date.now() + (o.deadlineMs ?? 30_000);
  const todo = await db.select().from(leads)
    // Never looked up, or blocked over a week ago (a wall can come down; a "no match" stays a no match).
    .where(and(eq(leads.userId, userId), sql`${leads.tags} @> '["ops"]'::jsonb`, notInArray(leads.status, CLOSED),
      sql`(${leads.companyWall} is null or (${leads.companyWall}->>'result' = 'blocked' and (${leads.companyWall}->>'checkedAt')::timestamptz < now() - interval '7 days'))`))
    .orderBy(asc(leads.id)).limit(o.limit ?? 5);
  const out = { checked: 0, found: 0, noMatch: 0, blocked: 0 };
  let first = true;
  const polite = async () => { if (!first) await sleep(gap); first = false; };
  const { reachRead } = await import("@/lib/services/reach");

  for (const l of todo) {
    if (Date.now() > deadline) break;
    let info: CompanyWallInfo;
    try {
      await polite();
      const link = pickFirmaLink(await searchPage(l.name), l.name, l.city);
      if (!link) {
        info = { ...parseCompanyWall("", null), result: "no_match", error: undefined };
      } else {
        await polite();
        info = parseCompanyWall((await reachRead(link, 40_000)).text, link);
      }
    } catch (e) {
      info = { ...parseCompanyWall("", null), result: "blocked", error: (e instanceof Error ? e.message : "failed").slice(0, 200) };
    }
    out.checked++;
    if (info.result === "no_match") out.noMatch++; else if (info.result === "blocked") out.blocked++; else out.found++;
    // A revenue you typed by hand wins; CompanyWall only fills the gap.
    const revenueKm = l.revenueKm ?? info.revenueKm;
    await db.update(leads).set({ companyWall: info, revenueKm, score: scoreLead({ ...l, revenueKm, companyWall: info }), updatedAt: new Date() }).where(eq(leads.id, l.id));
    // Blocked once → stop for this beat (being polite means not pushing through a wall).
    if (info.result === "blocked") break;
  }
  return out;
}
