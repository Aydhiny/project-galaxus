// Opportunity watcher: scans free public sources daily, scores each find for
// you, and puts the best deadlines straight into your tasks.

import { and, desc, eq, inArray, isNull, or, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities, type Opportunity } from "@/lib/db/schema";
import { AUTO_TASK_SCORE, oppScore, parseBihRss, parseDevpost, parseEu, parseItchJams, type Opp } from "@/lib/opportunities";
import { createTaskFor } from "@/lib/services/tasks";

const UA = "Mozilla/5.0 (compatible; Galaxus/1.0; opportunity watcher; https://project-galaxus.vercel.app)";
const BIH_FEEDS = [
  { url: "https://mp.ks.gov.ba/rss.xml", name: "Ministarstvo privrede KS" },
  { url: "https://www.fmrpo.gov.ba/feed/", name: "FMRPO" },
];
const EU_QUERIES = ["start-up young entrepreneurs", "video games creative", "artificial intelligence SME", "youth digital"];

async function get(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res;
}

async function fromDevpost(): Promise<Opp[]> {
  const pages = await Promise.all([1, 2].map((p) => get(`https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&order_by=deadline&page=${p}`).then((r) => r.json())));
  return pages.flatMap((j) => parseDevpost(j));
}

async function fromItch(): Promise<Opp[]> {
  return parseItchJams(await (await get("https://itch.io/jams/upcoming")).text());
}

async function fromEu(): Promise<Opp[]> {
  const settled = await Promise.allSettled(EU_QUERIES.map(async (q) => {
    const form = new FormData();
    // type 1/2/8 = calls for proposals; status 31094501/31094502 = forthcoming/open.
    form.append("query", new Blob([JSON.stringify({ bool: { must: [{ terms: { type: ["1", "2", "8"] } }, { terms: { status: ["31094501", "31094502"] } }] } })], { type: "application/json" }));
    form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));
    const r = await get(`https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=${encodeURIComponent(q)}&pageSize=30&pageNumber=1`, { method: "POST", body: form });
    return parseEu(await r.json());
  }));
  const ok = settled.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
  if (ok.length === 0 && settled.some((x) => x.status === "rejected")) throw new Error("EU search didn't answer");
  return ok;
}

async function fromBih(): Promise<Opp[]> {
  const settled = await Promise.allSettled(BIH_FEEDS.map(async (f) => parseBihRss(await (await get(f.url)).text(), f.name)));
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** Create a task for this opportunity's deadline (once). */
async function taskFor(userId: number, o: Pick<Opportunity, "id" | "title" | "url" | "deadline" | "kind" | "summary">) {
  const verb = o.kind === "jam" ? "Join jam" : o.kind === "hackathon" ? "Submit to hackathon" : "Apply";
  const due = o.deadline ? new Date(o.deadline.getTime() - (o.kind === "grant" ? 3 : 1) * 86_400_000) : null; // a little slack before the real deadline
  const task = await createTaskFor(userId, {
    title: `${verb}: ${o.title}`.slice(0, 500),
    notes: [o.summary, o.deadline ? `Deadline: ${dateKey(o.deadline)}` : null, o.url].filter(Boolean).join("\n"),
    dueDate: due ? dateKey(due) : null,
    priority: "high",
  });
  await db.update(opportunities).set({ status: "tasked", taskId: task.id }).where(and(eq(opportunities.id, o.id), eq(opportunities.userId, userId)));
  return task;
}

export async function scanOpportunitiesFor(userId: number, opts: { autoTasks?: number } = {}) {
  const errors: string[] = [];
  const names = ["Devpost", "itch.io", "EU portal", "BiH ministries"];
  const settled = await Promise.allSettled([fromDevpost(), fromItch(), fromEu(), fromBih()]);
  const found = settled.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    errors.push(`${names[i]}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
    return [];
  });
  const now = new Date();
  const unique = [...new Map(found.map((o) => [`${o.source}:${o.extId}`, o])).values()].filter((o) => !o.deadline || o.deadline > now);

  let added = 0;
  for (let i = 0; i < unique.length; i += 50) {
    const rows = unique.slice(i, i + 50).map((o) => ({
      userId, source: o.source, extId: o.extId, kind: o.kind, title: o.title, summary: o.summary, url: o.url.slice(0, 1000), image: o.image,
      deadline: o.deadline, prize: o.prize?.slice(0, 120) ?? null, location: o.location?.slice(0, 120) ?? null, tags: o.tags, score: oppScore(o, now),
    }));
    const r = await db.insert(opportunities).values(rows)
      .onConflictDoUpdate({ target: [opportunities.userId, opportunities.source, opportunities.extId], set: { deadline: sql`excluded.deadline`, score: sql`excluded.score`, image: sql`excluded.image`, summary: sql`excluded.summary` } })
      .returning({ id: opportunities.id, fresh: sql<boolean>`xmax = 0` });
    added += r.filter((x) => x.fresh).length;
  }

  // The very best with a real deadline go straight into your tasks.
  const best = await db.select().from(opportunities).where(and(
    eq(opportunities.userId, userId), eq(opportunities.status, "new"), gte(opportunities.score, AUTO_TASK_SCORE), gte(opportunities.deadline, now),
  )).orderBy(desc(opportunities.score)).limit(opts.autoTasks ?? 2);
  for (const o of best) await taskFor(userId, o);

  return { found: found.length, added, tasked: best.length, errors };
}

export async function opportunitiesFor(userId: number) {
  return db.select().from(opportunities).where(and(
    eq(opportunities.userId, userId), inArray(opportunities.status, ["new", "saved", "tasked"]),
    or(isNull(opportunities.deadline), gte(opportunities.deadline, new Date())),
  )).orderBy(desc(opportunities.score)).limit(300);
}

export async function addOpportunityTaskFor(userId: number, id: number) {
  const [o] = await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.userId, userId))).limit(1);
  if (!o) throw new Error("Not found.");
  if (o.taskId) return { taskId: o.taskId };
  return { taskId: (await taskFor(userId, o)).id };
}

export async function setOpportunityStatusFor(userId: number, id: number, status: "new" | "saved" | "hidden") {
  await db.update(opportunities).set({ status }).where(and(eq(opportunities.id, id), eq(opportunities.userId, userId)));
}

export type { Opportunity };
