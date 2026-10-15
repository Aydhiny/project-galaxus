// The results page's data: every project with its live progress (/ops/results),
// and one project in full (/ops/results/[id]): the merged sheet, every result,
// and its timeline. Read-only, and always the signed-in user's own rows: every
// query is scoped by userId, so another user's project id simply finds nothing.

import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsEvents, opsMemories, opsMessages, opsMissions, opsProjects } from "@/lib/db/schema";
import { isLate, mergeTables, projectDay } from "@/lib/ops";
import { goalProgress } from "@/lib/ops-progress";
import { sheetModel, sheetStats, timelineKind, type TimelineItem } from "@/lib/ops-results";

const today = () => new Date().toISOString().slice(0, 10);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const FINAL_TITLE = /^Write the final solution:/;
// Events agents log while they work (pages read, searches, edits) are too many for a compact timeline; these say what happened.
const TIMELINE_EVENT_KINDS = new Set(["status", "message", "delegate", "waiting"]);

type MissionLite = { projectId: number | null; status: string; dueDay: string | null; spentCents: number; freeCalls: number | null; deliverable: string | null };

/** Counts, sheet and progress for one project from its missions (shared by the index and the project page). */
function summarize(p: typeof opsProjects.$inferSelect, ms: MissionLite[], t: string) {
  const sheet = mergeTables(ms.filter((m) => (m.status === "done" || m.status === "submitted") && m.deliverable).map((m) => m.deliverable!));
  const stats = sheetStats(sheetModel(sheet).rows);
  return {
    sheet,
    ...projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, t),
    done: ms.filter((m) => m.status === "done").length,
    review: ms.filter((m) => m.status === "submitted").length,
    active: ms.filter((m) => m.status === "open" || m.status === "claimed").length,
    late: ms.filter((m) => isLate({ status: m.status, dueDay: m.dueDay ? String(m.dueDay) : null }, t)).length,
    spentCents: ms.reduce((s, m) => s + m.spentCents, 0),
    freeRuns: ms.reduce((s, m) => s + (m.freeCalls ?? 0), 0),
    progress: goalProgress(p.goal, sheet),
    needWebsite: stats.needWebsite,
    finishing: p.status === "active" && !!p.finalAt,
  };
}

/** Every project that isn't cancelled, newest first, with progress toward its number and when anything last happened. */
export async function resultsIndexFor(userId: number) {
  const rows = await db.select().from(opsProjects)
    .where(and(eq(opsProjects.userId, userId), inArray(opsProjects.status, ["active", "paused", "done"]))).orderBy(desc(opsProjects.id)).limit(100);
  if (!rows.length) return { now: Date.now(), projects: [] };
  const ids = rows.map((r) => r.id);
  const [missions, lastEvents, agents] = await Promise.all([
    db.select({ projectId: opsMissions.projectId, status: opsMissions.status, dueDay: opsMissions.dueDay, spentCents: opsMissions.spentCents, freeCalls: opsMissions.freeCalls,
      deliverable: opsMissions.deliverable, createdAt: opsMissions.createdAt, submittedAt: opsMissions.submittedAt })
      .from(opsMissions).where(and(eq(opsMissions.userId, userId), inArray(opsMissions.projectId, ids))),
    db.select({ projectId: opsMissions.projectId, at: sql<Date>`max(${opsEvents.at})`.mapWith(opsEvents.at) })
      .from(opsEvents).innerJoin(opsMissions, eq(opsEvents.missionId, opsMissions.id))
      .where(and(eq(opsEvents.userId, userId), eq(opsMissions.userId, userId), inArray(opsMissions.projectId, ids))).groupBy(opsMissions.projectId),
    db.select({ id: opsAgents.id, name: opsAgents.name, cloud: opsAgents.cloud }).from(opsAgents).where(eq(opsAgents.userId, userId)),
  ]);
  const t = today();
  return { now: Date.now(), projects: rows.map((p) => {
    const ms = missions.filter((m) => m.projectId === p.id);
    const { sheet, ...s } = summarize(p, ms, t);
    const lead = agents.find((a) => a.id === p.leadAgentId) ?? null;
    // Last activity: the newest of its events, deliveries, posted missions, and the plan.
    const times = [lastEvents.find((e) => e.projectId === p.id)?.at, ...ms.flatMap((m) => [m.submittedAt, m.createdAt]), p.planStartedAt, p.finalAt, p.createdAt]
      .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
    const last = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
    return {
      id: p.id, title: p.title, goal: p.goal, status: p.status, deadline: String(p.deadline), budgetCents: p.budgetCents,
      lead: lead ? { name: lead.name, cloud: lead.cloud } : null,
      sheetRows: Math.max(0, sheet.length - 1), lastActivity: iso(last), ...s,
    };
  }) };
}
export type ResultsIndexItem = Awaited<ReturnType<typeof resultsIndexFor>>["projects"][number];

/** One project in full, or null when it isn't the user's (the page turns that into a 404). */
export async function projectResultsFor(userId: number, projectId: number) {
  if (!Number.isInteger(projectId) || projectId <= 0) return null;
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) return null;
  const [missions, agents, memories] = await Promise.all([
    db.select().from(opsMissions).where(and(eq(opsMissions.userId, userId), eq(opsMissions.projectId, p.id))).orderBy(opsMissions.id),
    db.select({ id: opsAgents.id, name: opsAgents.name, role: opsAgents.role, provider: opsAgents.provider, cloud: opsAgents.cloud, engine: opsAgents.engine })
      .from(opsAgents).where(eq(opsAgents.userId, userId)),
    db.select({ type: opsMemories.type, title: opsMemories.title, body: opsMemories.body, source: opsMemories.source, createdAt: opsMemories.createdAt })
      .from(opsMemories).where(and(eq(opsMemories.userId, userId), eq(opsMemories.projectId, p.id))).orderBy(desc(opsMemories.createdAt)).limit(40),
  ]);
  const mids = missions.map((m) => m.id);
  const since = p.createdAt ?? new Date(`${String(p.startDay)}T00:00:00Z`);
  // or() of nothing is "no filter", so with neither missions nor a lead there's no radio to read at all.
  const radioScope = mids.length || p.leadAgentId
    ? or(mids.length ? inArray(opsMessages.missionId, mids) : undefined, p.leadAgentId ? eq(opsMessages.fromAgentId, p.leadAgentId) : undefined)
    : undefined;
  const [events, messages] = await Promise.all([
    mids.length
      ? db.select({ agentId: opsEvents.agentId, missionId: opsEvents.missionId, kind: opsEvents.kind, label: opsEvents.label, at: opsEvents.at }).from(opsEvents)
        .where(and(eq(opsEvents.userId, userId), inArray(opsEvents.missionId, mids))).orderBy(desc(opsEvents.at)).limit(400)
      : Promise.resolve([]),
    // The lead's day plans and hand-offs carry no mission id, so the lead's radio since the project began is read and matched below.
    radioScope
      ? db.select({ fromAgentId: opsMessages.fromAgentId, toAgentId: opsMessages.toAgentId, missionId: opsMessages.missionId, body: opsMessages.body, at: opsMessages.at })
        .from(opsMessages).where(and(eq(opsMessages.userId, userId), gte(opsMessages.at, since), radioScope)).orderBy(desc(opsMessages.at)).limit(400)
      : Promise.resolve([]),
  ]);

  const t = today();
  const { sheet, ...s } = summarize(p, missions.map((m) => ({ ...m, dueDay: m.dueDay ? String(m.dueDay) : null })), t);
  const agent = (id: number | null | undefined) => (id ? agents.find((a) => a.id === id) ?? null : null);
  const nameOf = (id: number | null | undefined) => agent(id)?.name ?? null;
  const lead = agent(p.leadAgentId);
  const titles = missions.map((m) => `"${m.title}"`);
  const mine = messages.filter((m) => (m.missionId != null && mids.includes(m.missionId))
    || m.body.startsWith(`${p.title} · day `)
    || (m.body.startsWith("For you today:") && titles.some((x) => m.body.includes(x))));

  const results = missions.filter((m) => m.deliverable && m.status !== "cancelled" && !FINAL_TITLE.test(m.title)).map((m) => {
    const by = agent(m.submittedBy ?? m.agentId);
    return {
      id: m.id, title: m.deliverableTitle || m.title, mission: m.title, status: m.status, day: String(m.day),
      deliverable: m.deliverable!, chiefNote: m.chiefNote, reviewRound: m.reviewRound,
      agent: by ? { name: by.name, cloud: by.cloud, provider: by.provider, engine: by.engine } : null,
      spentCents: m.spentCents, costMeasured: m.costMeasured, freeCalls: m.freeCalls ?? 0, nightShift: m.nightShift,
      submittedAt: iso(m.submittedAt),
    };
  });

  const timeline: TimelineItem[] = [
    ...events.filter((e) => TIMELINE_EVENT_KINDS.has(e.kind) || timelineKind(e.label, e.kind) !== "work")
      .map((e) => ({ at: e.at.toISOString(), kind: timelineKind(e.label, e.kind), who: nameOf(e.agentId), text: e.label })),
    ...mine.map((m) => ({ at: m.at.toISOString(), kind: timelineKind(m.body, "message"), who: m.fromAgentId ? nameOf(m.fromAgentId) : "You",
      text: (m.toAgentId && !m.body.startsWith("For you today:") ? `→ ${nameOf(m.toAgentId) ?? "crew"}: ` : "") + m.body.split("\n").slice(0, 3).join(" · ").slice(0, 300) })),
    ...missions.filter((m) => m.submittedAt).map((m) => ({ at: m.submittedAt!.toISOString(), kind: "delivery" as const, who: nameOf(m.submittedBy ?? m.agentId), text: `Delivered "${m.title}"` })),
    // The Chief's verdict has no time of its own; it lands right after the delivery it judged.
    ...missions.filter((m) => m.submittedAt && m.chiefNote && !m.chiefNote.startsWith("⋯")).map((m) => ({
      at: new Date(m.submittedAt!.getTime() + 1).toISOString(), kind: "review" as const, who: "Chief",
      text: `${m.reviewRound ? `Round ${m.reviewRound} · ` : ""}"${m.title}": ${m.chiefNote!.slice(0, 240)}` })),
    ...memories.filter((x) => x.type === "decision").map((x) => ({ at: x.createdAt.toISOString(), kind: "decision" as const, who: null, text: x.title })),
    ...(p.planError ? [{ at: (p.planStartedAt ?? new Date()).toISOString(), kind: "error" as const, who: lead?.name ?? null, text: `Couldn't plan: ${p.planError}` }] : []),
  ];

  // The final result: a local lead's "Write the final solution" deliverable is the full text; a cloud lead's lives on the
  // project page, with a compressed copy in shared memory.
  const finalMission = [...missions].reverse().find((m) => FINAL_TITLE.test(m.title) && m.deliverable);
  const finalMemory = memories.find((x) => x.source === `project-final:${p.id}`);
  const final = finalMission?.deliverable ? { md: finalMission.deliverable, full: true } : finalMemory ? { md: finalMemory.body, full: false } : null;

  return {
    now: Date.now(),
    project: {
      id: p.id, title: p.title, goal: p.goal, status: p.status, startDay: String(p.startDay), deadline: String(p.deadline), budgetCents: p.budgetCents,
      pageId: p.pageId, plan: p.plan, planError: p.planError, planStartedAt: iso(p.planStartedAt), finalAt: iso(p.finalAt),
      lead: lead ? { name: lead.name, role: lead.role, cloud: lead.cloud, provider: lead.provider, engine: lead.engine } : null,
      ...s,
    },
    sheet, results, final,
    timeline: timeline.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500),
  };
}
export type ProjectResults = NonNullable<Awaited<ReturnType<typeof projectResultsFor>>>;
