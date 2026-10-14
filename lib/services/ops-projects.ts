// Projects: a goal with a real deadline ("in 14 days, a plan to earn 500 KM a
// month from video editing"). Every shift day the lead agent looks at what's
// done, what's late and what you answered, and plans that day's missions with
// due dates; the crew works, delivers and logs off. Each evening the day goes
// on the project page; on the deadline the lead writes the final solution.
//
// A cloud lead does this on your Claude runner (counted against your budget).
// A lead on your computer gets a "plan today" mission instead and does the
// same through MCP (ops_get_project + ops_create_mission).

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsMessages, opsMissions, opsProjects, type OpsProject } from "@/lib/db/schema";
import {
  EFFORTS, MAX_PROJECT_MISSIONS_PER_DAY, MISSION_KINDS, MISSION_KIND_INFO, ROLES, ROLE_KEYS, addDays, formatUsd, isLate, parseProjectInput, projectDay, roleOf,
  type Effort, type MissionKind, type RoleKey,
} from "@/lib/ops";

const today = () => new Date().toISOString().slice(0, 10);

export async function createProjectFor(userId: number, raw: Record<string, unknown>) {
  const p = parseProjectInput(raw, today());
  let lead = p.leadAgentId;
  if (lead) {
    const [a] = await db.select({ id: opsAgents.id }).from(opsAgents).where(and(eq(opsAgents.id, lead), eq(opsAgents.userId, userId))).limit(1);
    if (!a) throw new Error("That agent doesn't exist.");
  } else {
    // Default lead: your cloud Chief of staff, else any Chief.
    const chiefs = await db.select().from(opsAgents).where(and(eq(opsAgents.userId, userId), eq(opsAgents.role, "chief")));
    lead = (chiefs.find((c) => c.cloud) ?? chiefs[0])?.id ?? null;
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsProjects).where(and(eq(opsProjects.userId, userId), eq(opsProjects.status, "active")));
  if (n >= 5) throw new Error("Five projects at once is plenty. Finish or pause one first.");
  const { createPageFromMarkdown } = await import("@/lib/services/ops-deliver");
  const pageId = await createPageFromMarkdown(userId, `Project · ${p.title}`,
    `# ${p.title}\n\n${p.goal}\n\nDeadline: ${p.deadline} (${projectDay(p, p.startDay).totalDays} days)${p.budgetCents ? ` · Budget ${formatUsd(p.budgetCents)}` : ""}`, { icon: "🎯", intro: "Ops project: the plan, a report for every day, and the final solution land here." });
  const [row] = await db.insert(opsProjects).values({ userId, ...p, leadAgentId: lead, pageId }).returning();
  const { remember } = await import("@/lib/services/ops-memory");
  await remember(userId, { type: "goal", title: `Project: ${p.title} (due ${p.deadline})`, body: p.goal, source: `project:${row.id}`, projectId: row.id, pinned: true }).catch(() => null);
  await planProjectDayFor(userId, row);
  return row;
}

export async function setProjectStatusFor(userId: number, id: number, status: "active" | "paused" | "cancelled") {
  const [row] = await db.update(opsProjects).set({ status }).where(and(eq(opsProjects.id, id), eq(opsProjects.userId, userId))).returning();
  if (!row) throw new Error("Project not found.");
  if (status === "cancelled") {
    await db.update(opsMissions).set({ status: "cancelled" }).where(and(eq(opsMissions.projectId, id), inArray(opsMissions.status, ["open"])));
  }
  return row;
}

/** Projects with their day counter and progress, for the page. */
export async function projectsFor(userId: number) {
  const rows = await db.select().from(opsProjects).where(and(eq(opsProjects.userId, userId), inArray(opsProjects.status, ["active", "paused", "done"]))).orderBy(desc(opsProjects.id)).limit(12);
  if (!rows.length) return [];
  const missions = await db.select({ projectId: opsMissions.projectId, status: opsMissions.status, dueDay: opsMissions.dueDay, spentCents: opsMissions.spentCents })
    .from(opsMissions).where(and(eq(opsMissions.userId, userId), inArray(opsMissions.projectId, rows.map((r) => r.id))));
  const t = today();
  return rows.map((p) => {
    const ms = missions.filter((m) => m.projectId === p.id);
    return {
      ...p, ...projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, t),
      done: ms.filter((m) => m.status === "done").length,
      review: ms.filter((m) => m.status === "submitted").length,
      active: ms.filter((m) => m.status === "open" || m.status === "claimed").length,
      late: ms.filter((m) => isLate({ status: m.status, dueDay: m.dueDay ? String(m.dueDay) : null }, t)).length,
      spentCents: ms.reduce((s, m) => s + m.spentCents, 0),
    };
  });
}
export type OpsProjectView = Awaited<ReturnType<typeof projectsFor>>[number];

/** What a mission prompt needs to know about its project. */
export async function projectContext(userId: number, projectId: number) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) return null;
  return { title: p.title, goal: p.goal, ...projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, today()) };
}

/** Everything the lead needs to plan (or finish): goal, plan, day, results so far, late work, your answers, the crew, money. */
async function projectBrief(userId: number, p: OpsProject) {
  const t = today();
  const d = projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, t);
  const { memoryBrief } = await import("@/lib/services/ops-memory");
  const [ms, crew, answers, memory] = await Promise.all([
    db.select().from(opsMissions).where(and(eq(opsMissions.userId, userId), eq(opsMissions.projectId, p.id))).orderBy(opsMissions.id),
    db.select({ name: opsAgents.name, role: opsAgents.role, cloud: opsAgents.cloud, provider: opsAgents.provider }).from(opsAgents).where(eq(opsAgents.userId, userId)),
    db.select({ q: opsMessages.body, a: opsMessages.answer }).from(opsMessages)
      .where(and(eq(opsMessages.userId, userId), eq(opsMessages.toUser, true), eq(opsMessages.kind, "question"), sql`${opsMessages.answer} is not null`,
        sql`${opsMessages.missionId} in (select id from ops_missions where project_id = ${p.id})`)).limit(20),
    memoryBrief(userId, `${p.title} ${p.goal}`, 1500).catch(() => ""),
  ]);
  const spent = ms.reduce((s, m) => s + m.spentCents, 0);
  const results = ms.filter((m) => (m.status === "done" || m.status === "submitted") && m.deliverable);
  return {
    d, spent, ms,
    text: [
      `PROJECT: ${p.title}`,
      `GOAL: ${p.goal}`,
      `Today is ${t}: day ${d.dayNo} of ${d.totalDays}. Deadline ${String(p.deadline)} (${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} after today).`,
      p.budgetCents ? `Budget: ${formatUsd(p.budgetCents)}, spent ${formatUsd(spent)}.` : "",
      p.plan ? `\nPLAN SO FAR:\n${p.plan.slice(0, 3000)}` : "",
      results.length ? `\nRESULTS SO FAR:\n${results.slice(-8).map((m) => `- "${m.title}" (${m.status === "done" ? "accepted" : "waiting for review"}): ${(m.deliverable ?? "").replace(/\s+/g, " ").slice(0, 400)}`).join("\n")}` : "\nRESULTS SO FAR: none yet.",
      ms.some((m) => isLate({ status: m.status, dueDay: m.dueDay ? String(m.dueDay) : null }, t))
        ? `\nLATE (carry over or replace):\n${ms.filter((m) => isLate({ status: m.status, dueDay: m.dueDay ? String(m.dueDay) : null }, t)).map((m) => `- ${m.title} (was due ${String(m.dueDay)})`).join("\n")}` : "",
      ms.some((m) => m.status === "open" || m.status === "claimed") ? `\nSTILL IN PROGRESS:\n${ms.filter((m) => m.status === "open" || m.status === "claimed").map((m) => `- ${m.title}`).join("\n")}` : "",
      answers.length ? `\nTHE USER ANSWERED:\n${answers.map((x) => `- Q: ${x.q} → A: ${x.a}`).join("\n")}` : "",
      memory ? `\nWHAT WE KNOW ABOUT THE USER (shared memory):\n${memory}` : "",
      `\nCREW: ${crew.map((c) => `${c.name} (${ROLES[roleOf(c.role)].label}, ${c.cloud ? "cloud" : c.provider})`).join("; ")}`,
    ].filter(Boolean).join("\n"),
  };
}

/**
 * Plan today for a project (once per day). With a cloud lead and room in the
 * budget, Claude plans it; otherwise the lead gets a "plan today" mission.
 * On the deadline day, it's the final solution instead.
 */
/** For ops_get_project: one project or all active ones, as text an agent can plan from. */
export async function projectBriefsFor(userId: number, projectId?: number) {
  const rows = await db.select().from(opsProjects)
    .where(and(eq(opsProjects.userId, userId), eq(opsProjects.status, "active"), ...(projectId ? [eq(opsProjects.id, projectId)] : []))).limit(5);
  if (!rows.length) return projectId ? "No active project with that id." : "No active projects.";
  return Promise.all(rows.map(async (p) => ({ project_id: p.id, brief: (await projectBrief(userId, p)).text })));
}

export async function planProjectDayFor(userId: number, p: OpsProject) {
  const t = today();
  if (p.status !== "active" || String(p.lastPlannedDay ?? "") === t) return false;
  const d = projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, t);
  if (d.phase === "not started") return false;
  // Claim the day first, so two beats can't both plan it.
  const [won] = await db.update(opsProjects).set({ lastPlannedDay: t })
    .where(and(eq(opsProjects.id, p.id), sql`(${opsProjects.lastPlannedDay} is null or ${opsProjects.lastPlannedDay} <> ${t})`)).returning();
  if (!won) return false;
  const [lead] = p.leadAgentId ? await db.select().from(opsAgents).where(eq(opsAgents.id, p.leadAgentId)).limit(1) : [];
  const finalDay = d.phase === "final" || d.phase === "over";
  if (lead?.cloud) {
    const { budgetFor } = await import("@/lib/services/ops-inbox");
    const { runPlannerJob } = await import("@/lib/services/ops-free");
    const b = await budgetFor(userId);
    // Claude when it can; a free model when Claude is paused or out of budget (and "free fallback" is on).
    const ran = await runPlannerJob(userId, finalDay ? "ops_project_final" : "ops_project_day", `Project: ${p.title} · day ${d.dayNo}`, {
      projectId: p.id, leadId: lead.id, model: b.model, capCents: Math.min(finalDay ? 80 : 40, b.leftToday),
    });
    if (ran) return true;
  }
  // No cloud lead (or neither Claude nor a free model can take it): the lead gets a mission to plan/finish it through MCP.
  await db.insert(opsMissions).values({
    userId, day: t, projectId: p.id, dueDay: t, kind: "other", effort: "normal",
    title: finalDay ? `Write the final solution: ${p.title}` : `Plan day ${d.dayNo}/${d.totalDays}: ${p.title}`,
    brief: finalDay
      ? "It's the deadline. Call ops_get_project, read every result, and submit the final solution as your deliverable: what to do, why, the numbers, and the next steps."
      : "Call ops_get_project, then post today's missions with ops_create_mission (project_id, due_in_days, role). Keep it to what moves the goal forward today.",
    agentId: lead?.id ?? null, role: lead ? null : "chief",
  });
  return true;
}

const PLAN_SYSTEM = `You are the lead of a project at Galaxus Ops, coordinating a small crew of AI agents for a student in Sarajevo on a tight budget.
Plan TODAY only. Reply with ONLY a JSON object:
{"plan": "the overall plan in short markdown (write it on day 1; afterwards only if it must change, else empty)",
 "message": "2-4 lines to the crew: today's priorities and who does what",
 "missions": [{"title": "...", "brief": "what a good result looks like", "role": "${ROLE_KEYS.join("|")}", "kind": "${MISSION_KINDS.join("|")}", "effort": "quick|normal|deep", "due_in_days": 0}],
 "question_for_user": null or {"question": "...", "options": ["...", "..."]}}
At most ${MAX_PROJECT_MISSIONS_PER_DAY} missions. Prefer "quick" (cheapest) unless a task really needs depth. Most are due today (due_in_days 0).
Don't repeat finished work; build on results. Ask the user only when a decision is truly theirs. Missions are research, writing, planning and analysis — never sending, buying or deploying.`;

export async function buildProjectDayPrompt(userId: number, projectId: number) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) throw new Error("Project not found.");
  return { system: PLAN_SYSTEM, prompt: (await projectBrief(userId, p)).text };
}

export async function applyProjectDayResult(userId: number, projectId: number, leadId: number, text: string) {
  const { parseJsonReply } = await import("@/lib/claude-jobs");
  type Plan = { plan?: string; message?: string; missions?: { title?: string; brief?: string; role?: string; kind?: string; effort?: string; due_in_days?: number }[]; question_for_user?: { question?: string; options?: string[] } | null };
  const r = parseJsonReply<Plan>(text);
  if (!r) throw new Error("The lead's plan couldn't be read.");
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) return "Project is gone.";
  const [lead] = await db.select().from(opsAgents).where(eq(opsAgents.id, leadId)).limit(1);
  const t = today();
  const d = projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, t);
  const left = p.budgetCents != null ? p.budgetCents - (await projectBrief(userId, p)).spent : null;
  let made = 0;
  for (const m of (r.missions ?? []).slice(0, MAX_PROJECT_MISSIONS_PER_DAY)) {
    const title = String(m.title ?? "").trim().slice(0, 200);
    if (title.length < 3) continue;
    const kind: MissionKind = MISSION_KINDS.includes(m.kind as MissionKind) ? (m.kind as MissionKind) : "research";
    const role: RoleKey = ROLE_KEYS.includes(m.role as RoleKey) ? (m.role as RoleKey) : MISSION_KIND_INFO[kind].role;
    const effort: Effort = EFFORTS.includes(m.effort as Effort) ? (m.effort as Effort) : "quick";
    const due = Math.max(0, Math.min(Number(m.due_in_days) || 0, d.daysLeft));
    await db.insert(opsMissions).values({
      userId, day: t, projectId, title, brief: String(m.brief ?? "").slice(0, 3000) || null, kind, role, effort, dueDay: addDays(t, due),
      createdByAgentId: lead?.id ?? null, budgetCents: left != null ? Math.max(0, Math.min(left, effort === "deep" ? 150 : 50)) : null,
    });
    made++;
  }
  if (r.plan?.trim()) {
    await db.update(opsProjects).set({ plan: r.plan.trim().slice(0, 8000) }).where(eq(opsProjects.id, projectId));
    if (p.pageId) {
      const { appendMarkdownToPage } = await import("@/lib/services/ops-deliver");
      await appendMarkdownToPage(userId, p.pageId, d.dayNo <= 1 ? "Plan" : `Plan (updated day ${d.dayNo})`, r.plan.trim());
    }
  }
  if (lead && r.message) await db.insert(opsMessages).values({ userId, fromAgentId: lead.id, body: `${p.title} · day ${d.dayNo}/${d.totalDays}\n${String(r.message).slice(0, 1500)}` });
  if (lead && r.question_for_user?.question) {
    const { askUserForAgent } = await import("@/lib/services/ops-inbox");
    await askUserForAgent(lead, { question: r.question_for_user.question, options: r.question_for_user.options ?? [] }).catch(() => null);
  }
  const { dispatchCloudFor } = await import("@/lib/services/ops");
  await dispatchCloudFor(userId).catch(() => {});
  return `${p.title}: day ${d.dayNo} planned, ${made} mission${made === 1 ? "" : "s"}`;
}

const FINAL_SYSTEM = `You are the lead of a project at Galaxus Ops. The deadline is today. Write the FINAL SOLUTION for the user (a student in Sarajevo, tight budget):
markdown, lead with the recommendation in 2-3 sentences, then the plan step by step with numbers (prices in KM where relevant), what the crew found that supports it (cite results), risks, and the next 3 actions the user can take this week. Use only what the results support; say plainly what's still unknown. Reply with only the solution.`;

export async function buildProjectFinalPrompt(userId: number, projectId: number) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) throw new Error("Project not found.");
  return { system: FINAL_SYSTEM, prompt: (await projectBrief(userId, p)).text };
}

export async function applyProjectFinalResult(userId: number, projectId: number, text: string) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) return "Project is gone.";
  await finishProject(userId, p, text);
  return `${p.title}: final solution ready`;
}

async function finishProject(userId: number, p: OpsProject, md: string) {
  if (p.pageId) {
    const { appendMarkdownToPage } = await import("@/lib/services/ops-deliver");
    await appendMarkdownToPage(userId, p.pageId, "Final solution", md.trim().slice(0, 20_000));
  }
  await db.update(opsProjects).set({ status: "done", finalAt: new Date() }).where(eq(opsProjects.id, p.id));
  const { remember, compress } = await import("@/lib/services/ops-memory");
  // The goal is reached: unpin it, and remember the outcome.
  await remember(userId, { type: "goal", title: `Project: ${p.title} (done)`, body: p.goal, source: `project:${p.id}`, projectId: p.id, pinned: false }).catch(() => null);
  await remember(userId, { type: "decision", title: `Final solution: ${p.title}`, body: compress(md, 1500), source: `project-final:${p.id}`, projectId: p.id }).catch(() => null);
  const { pushFor } = await import("@/lib/services/ops-inbox");
  await pushFor(userId, "report", true, `Project done: ${p.title}`, "The final solution is on the project page.", `ops-project-${p.id}`);
}

/** A local lead submitted "Write the final solution": that deliverable IS the solution. */
export async function onProjectMissionSubmitted(userId: number, m: { projectId: number | null; title: string; deliverable: string | null }) {
  if (!m.projectId || !m.title.startsWith("Write the final solution:") || !m.deliverable) return;
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, m.projectId), eq(opsProjects.userId, userId))).limit(1);
  if (p && p.status === "active") await finishProject(userId, p, m.deliverable);
}

/** End of a working day: the day's report goes on the project page (once per day). */
export async function reportProjectDayFor(userId: number, p: OpsProject) {
  const t = today();
  if (p.status !== "active" || String(p.lastReportDay ?? "") === t) return false;
  const [won] = await db.update(opsProjects).set({ lastReportDay: t })
    .where(and(eq(opsProjects.id, p.id), sql`(${opsProjects.lastReportDay} is null or ${opsProjects.lastReportDay} <> ${t})`)).returning();
  if (!won) return false;
  const { d, ms, spent } = await projectBrief(userId, p);
  const due = ms.filter((m) => String(m.dueDay ?? "") === t);
  const done = due.filter((m) => m.status === "done" || m.status === "submitted");
  const late = due.filter((m) => m.status === "open" || m.status === "claimed");
  const md = [
    `${done.length} of ${due.length} due today delivered${late.length ? ` · ${late.length} late, carried to tomorrow` : ""} · spent ${formatUsd(spent)} so far.`,
    ...done.map((m) => `- [x] ${m.title}`),
    ...late.map((m) => `- [ ] ${m.title} (late)`),
    d.daysLeft ? `${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} to the deadline.` : "Deadline is today.",
  ].join("\n");
  if (p.pageId) {
    const { appendMarkdownToPage } = await import("@/lib/services/ops-deliver");
    await appendMarkdownToPage(userId, p.pageId, `Day ${d.dayNo} · ${t}`, md);
  }
  const { pushFor } = await import("@/lib/services/ops-inbox");
  await pushFor(userId, "report", false, `${p.title} · day ${d.dayNo}/${d.totalDays}`, md.split("\n")[0], `ops-day-${p.id}`);
  return true;
}

/** Everything project-shaped on a beat: plan today (when the shift is on), report at the end of it. */
export async function projectsTickFor(userId: number, o: { shiftOn: boolean; shiftEnded: boolean }) {
  const active = await db.select().from(opsProjects).where(and(eq(opsProjects.userId, userId), eq(opsProjects.status, "active")));
  let planned = 0, reported = 0;
  for (const p of active) {
    if (o.shiftOn && (await planProjectDayFor(userId, p))) planned++;
    if (o.shiftEnded && (await reportProjectDayFor(userId, p))) reported++;
  }
  return { planned, reported };
}
