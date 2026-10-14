// Shared memory for every agent — claude-mem's model (github.com/thedotmack/claude-mem),
// built into Galaxus so it works across machines, providers, cloud and free-model agents:
//   • captured automatically: who you are (from your Galaxus data), your answers to
//     agents (decisions), accepted results (findings), project goals and final solutions;
//   • searched token-efficiently in 3 steps, like claude-mem's MCP tools:
//     mem_search (compact index) → mem_timeline (what was around it) → mem_get (full text);
//   • injected as a short brief into every agent's check-in and cloud prompt.
// Agents can also save what's worth remembering with mem_remember.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsMemories, type OpsMemory } from "@/lib/db/schema";
import { redact } from "@/lib/ops";

export const MEMORY_TYPES = ["about", "goal", "decision", "finding", "preference", "note"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

const clean = (s: string, n: number) => redact(String(s ?? "")).replace(/\r/g, "").trim().slice(0, n);

/** Save (or update, by source) one memory. Sources are unique per user, so re-capturing the same thing updates it. */
export async function remember(userId: number, m: { type: MemoryType; title: string; body: string; source: string; projectId?: number | null; agentId?: number | null; pinned?: boolean; touch?: boolean }) {
  const title = clean(m.title, 200), body = clean(m.body, 4000);
  if (title.length < 2 || body.length < 2) return null;
  const [row] = await db.insert(opsMemories).values({ userId, type: m.type, title, body, source: m.source.slice(0, 60), projectId: m.projectId ?? null, agentId: m.agentId ?? null, pinned: !!m.pinned })
    .onConflictDoUpdate({ target: [opsMemories.userId, opsMemories.source], set: { type: m.type, title, body, ...(m.pinned != null ? { pinned: m.pinned } : {}), ...(m.touch ? { createdAt: new Date() } : {}) } })
    .returning();
  return row;
}

/** A deliverable squeezed to what's worth remembering: the lead paragraph and the first bullets. */
export function compress(md: string, max = 900) {
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const lead = lines.filter((l) => !/^[-*#>|]/.test(l)).slice(0, 2).join(" ");
  const bullets = lines.filter((l) => /^[-*]\s/.test(l)).slice(0, 6).join("\n");
  return [lead, bullets].filter(Boolean).join("\n").slice(0, max);
}

const words = (q: string) => String(q ?? "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.slice(0, 10) ?? [];

/** Step 1: a compact index (~1 line per memory), best matches first. */
export async function memSearch(userId: number, query: string, o: { type?: string; limit?: number } = {}) {
  const w = words(query);
  const hay = sql`lower(${opsMemories.title} || ' ' || ${opsMemories.body})`;
  const score = w.length ? sql.join(w.map((x) => sql`(case when ${hay} like ${`%${x}%`} then 1 else 0 end)`), sql` + `) : sql`0`;
  const rows = await db.select({ id: opsMemories.id, type: opsMemories.type, title: opsMemories.title, body: opsMemories.body, at: opsMemories.createdAt, pinned: opsMemories.pinned, score: sql<number>`(${score})::int` })
    .from(opsMemories)
    .where(and(eq(opsMemories.userId, userId), ...(o.type && (MEMORY_TYPES as readonly string[]).includes(o.type) ? [eq(opsMemories.type, o.type)] : []), ...(w.length ? [sql`(${score}) > 0`] : [])))
    .orderBy(sql`(${score}) desc`, desc(opsMemories.pinned), desc(opsMemories.createdAt)).limit(Math.min(25, o.limit ?? 10));
  return rows.map((r) => ({ id: r.id, type: r.type, title: r.title, date: r.at.toISOString().slice(0, 10), preview: r.body.replace(/\s+/g, " ").slice(0, 90), ...(r.pinned ? { pinned: true } : {}) }));
}

/** Step 2: what else was remembered around then (or around the best match for a query). */
export async function memTimeline(userId: number, o: { aroundId?: number; query?: string; window?: number }) {
  let anchor: OpsMemory | undefined;
  if (o.aroundId) [anchor] = await db.select().from(opsMemories).where(and(eq(opsMemories.id, o.aroundId), eq(opsMemories.userId, userId))).limit(1);
  else if (o.query) { const [hit] = await memSearch(userId, o.query, { limit: 1 }); if (hit) [anchor] = await db.select().from(opsMemories).where(eq(opsMemories.id, hit.id)).limit(1); }
  if (!anchor) return [];
  const n = Math.min(10, o.window ?? 4);
  const [before, after] = await Promise.all([
    db.select().from(opsMemories).where(and(eq(opsMemories.userId, userId), sql`${opsMemories.createdAt} <= ${anchor.createdAt}`)).orderBy(desc(opsMemories.createdAt)).limit(n + 1),
    db.select().from(opsMemories).where(and(eq(opsMemories.userId, userId), sql`${opsMemories.createdAt} > ${anchor.createdAt}`)).orderBy(opsMemories.createdAt).limit(n),
  ]);
  return [...before.reverse(), ...after].map((r) => ({ id: r.id, type: r.type, title: r.title, date: r.createdAt.toISOString().slice(0, 16).replace("T", " "), ...(r.id === anchor!.id ? { anchor: true } : {}) }));
}

/** Step 3: full text, only for the ids you picked. */
export async function memGet(userId: number, ids: number[]) {
  const list = [...new Set(ids.filter((i) => Number.isInteger(i)))].slice(0, 15);
  if (!list.length) return [];
  const rows = await db.select().from(opsMemories).where(and(eq(opsMemories.userId, userId), inArray(opsMemories.id, list)));
  return rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, source: r.source, date: r.createdAt.toISOString().slice(0, 10) }));
}

/** The brief every agent gets: who you are, pinned memories, and what's most relevant to `focus`. */
export async function memoryBrief(userId: number, focus: string, maxChars = 2200) {
  const [pinned, relevant] = await Promise.all([
    db.select().from(opsMemories).where(and(eq(opsMemories.userId, userId), sql`(${opsMemories.pinned} or ${opsMemories.type} = 'about')`)).orderBy(desc(opsMemories.createdAt)).limit(6),
    focus.trim() ? memSearch(userId, focus, { limit: 5 }) : Promise.resolve([]),
  ]);
  const seen = new Set(pinned.map((p) => p.id));
  const lines = [
    ...pinned.map((p) => `- [${p.type}] ${p.title}: ${p.body.replace(/\s+/g, " ").slice(0, 400)}`),
    ...relevant.filter((r) => !seen.has(r.id)).map((r) => `- [${r.type}, ${r.date}] ${r.title}: ${r.preview}`),
  ];
  return lines.join("\n").slice(0, maxChars);
}

/** "About me" from what Galaxus already knows (refreshed daily): goals this month, money goal, gigs, game, channel, projects. */
export async function refreshAboutMe(userId: number) {
  const month = new Date().toISOString().slice(0, 7);
  const q = async <T>(text: ReturnType<typeof sql>) => ((await db.execute(text)) as unknown as { rows: T[] }).rows ?? [];
  const [user, goals, settings, gigs, game, channel, projects] = await Promise.all([
    q<{ name: string }>(sql`select name from users where id = ${userId}`),
    q<{ title: string }>(sql`select title from monthly_goals where user_id = ${userId} and month = ${month} and status in ('active','achieved') limit 6`),
    q<{ income_goal_km: number | null; city: string | null }>(sql`select s.income_goal_km, s.weather_place as city from user_settings s where s.user_id = ${userId}`),
    q<{ name: string; pitch: string | null }>(sql`select name, pitch from gig_profiles where user_id = ${userId} limit 3`),
    q<{ x: number }>(sql`select 1 as x from game_settings where user_id = ${userId} limit 1`).catch(() => []),
    q<{ title: string }>(sql`select title from youtube_channels where user_id = ${userId} limit 1`).catch(() => []),
    q<{ title: string; goal: string }>(sql`select title, goal from ops_projects where user_id = ${userId} and status = 'active' limit 3`),
  ]);
  const parts = [
    user[0]?.name ? `Name: ${user[0].name}.` : "",
    `Lives in ${settings[0]?.city || "Sarajevo"}, Bosnia and Herzegovina. Student on a tight budget (a $20 Claude plan).`,
    goals.length ? `This month's goals: ${goals.map((g) => g.title).join("; ")}.` : "",
    settings[0]?.income_goal_km ? `Monthly income goal: ${settings[0].income_goal_km} KM.` : "",
    gigs.length ? `Sells: ${gigs.map((g) => `${g.name}${g.pitch ? ` (${g.pitch.slice(0, 120)})` : ""}`).join("; ")}.` : "",
    game.length ? "Makes a game (Hunter Mouse 2, a cute 3D platformer)." : "",
    channel[0]?.title ? `YouTube channel: ${channel[0].title}.` : "",
    projects.length ? `Active Ops projects: ${projects.map((p) => `${p.title} — ${p.goal.slice(0, 160)}`).join(" | ")}.` : "",
  ].filter(Boolean).join(" ");
  return remember(userId, { type: "about", title: "About the user (from Galaxus)", body: parts, source: "galaxus:about", pinned: true, touch: true });
}

/** Refresh "about me" at most once every 20 hours (called on every scheduler beat). */
export async function refreshAboutMeIfStale(userId: number) {
  const [row] = await db.select({ at: opsMemories.createdAt }).from(opsMemories).where(and(eq(opsMemories.userId, userId), eq(opsMemories.source, "galaxus:about"))).limit(1);
  if (row && Date.now() - row.at.getTime() < 20 * 3_600_000) return false;
  await refreshAboutMe(userId);
  return true;
}

export async function memoriesFor(userId: number, limit = 80) {
  return db.select().from(opsMemories).where(eq(opsMemories.userId, userId)).orderBy(desc(opsMemories.pinned), desc(opsMemories.createdAt)).limit(limit);
}
export async function setPinnedFor(userId: number, id: number, pinned: boolean) {
  await db.update(opsMemories).set({ pinned }).where(and(eq(opsMemories.id, id), eq(opsMemories.userId, userId)));
}
export async function forgetFor(userId: number, id: number) {
  await db.delete(opsMemories).where(and(eq(opsMemories.id, id), eq(opsMemories.userId, userId)));
}
/** Your own note (e.g. "About me" in your words, or a preference). */
export async function addNoteFor(userId: number, raw: { type?: string; title: string; body: string }) {
  const type = (MEMORY_TYPES as readonly string[]).includes(String(raw.type)) ? (raw.type as MemoryType) : "note";
  const row = await remember(userId, { type, title: raw.title, body: raw.body, source: `you:${Date.now()}`, pinned: type === "about" || type === "preference" });
  if (!row) throw new Error("Write a title and a sentence or two.");
  return row;
}
