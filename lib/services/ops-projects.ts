// Projects: a goal with a real deadline ("in 14 days, a plan to earn 500 KM a
// month from video editing"). Every shift day the lead agent looks at what's
// done, what's late and what you answered, and plans that day's missions with
// due dates (to crew members by name); the crew works, the lead reviews, and
// each evening the day goes on the project page. The final result is written
// at the end of the deadline day (or as soon as nothing is left in progress on
// it), never from zero results. For "find me N things" goals, missions return
// table rows and the final is the merged sheet (downloadable as Excel).
//
// A cloud lead does this on your Claude runner (counted against your budget).
// A lead on your computer gets a "plan today" mission instead and does the
// same through MCP (ops_get_project + ops_create_mission).

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { OSM_TYPES } from "@/lib/outreach";
import { opsAgents, opsMessages, opsMissions, opsProjects, type OpsProject } from "@/lib/db/schema";
import {
  EFFORTS, MAX_PROJECT_MISSIONS_PER_DAY, MISSION_KINDS, MISSION_KIND_INFO, ROLES, ROLE_KEYS, addDays, formatUsd, isLate, mergeTables, parseProjectInput, projectDay, projectStep, roleOf,
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
  const missions = await db.select({ projectId: opsMissions.projectId, status: opsMissions.status, dueDay: opsMissions.dueDay, spentCents: opsMissions.spentCents, deliverable: opsMissions.deliverable })
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
      // Rows in the merged sheet so far (0 = not a list project, or nothing yet).
      sheetRows: Math.max(0, mergeTables(ms.filter((m) => (m.status === "done" || m.status === "submitted") && m.deliverable).map((m) => m.deliverable!)).length - 1),
      finishing: p.status === "active" && !!p.finalAt,
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

/** For ops_get_project: one project or all active ones, as text an agent can plan from. */
export async function projectBriefsFor(userId: number, projectId?: number) {
  const rows = await db.select().from(opsProjects)
    .where(and(eq(opsProjects.userId, userId), eq(opsProjects.status, "active"), ...(projectId ? [eq(opsProjects.id, projectId)] : []))).limit(5);
  if (!rows.length) return projectId ? "No active project with that id." : "No active projects.";
  return Promise.all(rows.map(async (p) => ({ project_id: p.id, brief: (await projectBrief(userId, p)).text })));
}

/** Results delivered, and work still going (a result the Chief is still reviewing counts as in progress). Planning missions don't count. */
async function projectProgress(userId: number, projectId: number) {
  const ms = await db.select({ status: opsMissions.status, deliverable: opsMissions.deliverable, title: opsMissions.title, chiefNote: opsMissions.chiefNote })
    .from(opsMissions).where(and(eq(opsMissions.userId, userId), eq(opsMissions.projectId, projectId)));
  const work = ms.filter((m) => !/^(Plan day \d+\/\d+|Write the final solution):/.test(m.title));
  return {
    results: work.filter((m) => (m.status === "done" || m.status === "submitted") && m.deliverable).length,
    inProgress: work.filter((m) => m.status === "open" || m.status === "claimed" || (m.status === "submitted" && m.chiefNote?.startsWith("⋯"))).length,
  };
}

/**
 * One project beat: plan today's work (every day, the deadline day too), or
 * write the final result when it's time (see projectStep). Returns what it did.
 */
export async function planProjectDayFor(userId: number, p: OpsProject, o: { dayEnded?: boolean } = {}) {
  const t = today();
  if (p.status !== "active") return false;
  // A final that never came back (job failed): try again after 6 hours.
  if (p.finalAt && Date.now() - p.finalAt.getTime() > 6 * 3_600_000) {
    await db.update(opsProjects).set({ finalAt: null }).where(eq(opsProjects.id, p.id));
    p = { ...p, finalAt: null };
  } else if (p.finalAt) return false;
  const d = projectDay({ startDay: String(p.startDay), deadline: String(p.deadline) }, t);
  const step = projectStep({ phase: d.phase, plannedToday: String(p.lastPlannedDay ?? "") === t, dayEnded: !!o.dayEnded, ...(await projectProgress(userId, p.id)) });
  if (step === "wait") return false;
  // Claim it first, so two beats can't both plan the day (or both write the final).
  const [won] = step === "plan"
    ? await db.update(opsProjects).set({ lastPlannedDay: t }).where(and(eq(opsProjects.id, p.id), sql`(${opsProjects.lastPlannedDay} is null or ${opsProjects.lastPlannedDay} <> ${t})`)).returning()
    : await db.update(opsProjects).set({ finalAt: new Date() }).where(and(eq(opsProjects.id, p.id), sql`${opsProjects.finalAt} is null`)).returning();
  if (!won) return false;
  const [lead] = p.leadAgentId ? await db.select().from(opsAgents).where(eq(opsAgents.id, p.leadAgentId)).limit(1) : [];
  const finalDay = step === "finish";
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
      ? "Call ops_get_project, read every result, and submit the final result as your deliverable: what the goal asked for (for a list goal, all the rows as one table), what's missing, and next steps."
      : "Call ops_get_project, then post today's missions with ops_create_mission (project_id, due_in_days, and `to` = a crew member's name). Missions must DO the work. For a list goal, fix the columns and have every mission return its rows as one markdown table.",
    agentId: lead?.id ?? null, role: lead ? null : "chief",
  });
  return true;
}

const PLAN_SYSTEM = `You are the lead of a project at Galaxus Ops, coordinating a small crew of AI agents for a student in Sarajevo on a tight budget.
Plan TODAY's work only. Reply with ONLY a JSON object:
{"plan": "the overall plan in short markdown (write it on day 1; afterwards only if it must change, else empty)",
 "message": "2-4 lines to the crew: today's priorities and who does what",
 "missions": [{"title": "...", "brief": "exactly what to produce and what a good result looks like", "agent": "a name from CREW, or null for anyone with the role", "role": "${ROLE_KEYS.join("|")}", "kind": "${MISSION_KINDS.join("|")}", "effort": "quick|normal|deep", "due_in_days": 0}],
 "question_for_user": null or {"question": "...", "options": ["...", "..."]}}
Rules:
- Missions DO the work (find, check, collect, write). Never post a mission that only explains to the user how they could do it themselves.
- Use the whole crew: give each crew member work that fits their role, split so nobody overlaps (by category, area or source). Name them in "agent".
- If the goal is a list of LOCAL BUSINESSES (leads): use the business finder. Give each mission ONE category and city, and make the brief's FIRST line exactly
  "FIND: <type> @ <city>" with <type> one of: ${OSM_TYPES.map((t) => t.key).join(", ")}. Add "<N> rows" for the target. The finder returns the table (Name, Category, Address, Phone, WhatsApp, Email, Website, Website status, Source) from map data and the businesses' own pages — split categories and cities across the crew; several cities if one city can't reach the target.
- If the goal is any other list: fix the columns on day 1 (put them in the plan) and make EVERY mission deliver its rows as ONE markdown table with exactly those columns, plus a target row count per mission. Rows must be real and checked (a source link per row); never invent contact details — leave a cell empty when unknown.
- At most ${MAX_PROJECT_MISSIONS_PER_DAY} missions. Prefer "quick" (cheapest) unless a task needs depth. Most are due today (due_in_days 0).
- Don't repeat finished work; build on results. Ask the user only when a decision is truly theirs. Never sending, buying or deploying.`;

export async function buildProjectDayPrompt(userId: number, projectId: number) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) throw new Error("Project not found.");
  return { system: PLAN_SYSTEM, prompt: (await projectBrief(userId, p)).text };
}

export async function applyProjectDayResult(userId: number, projectId: number, leadId: number, text: string) {
  const { parseJsonReply } = await import("@/lib/claude-jobs");
  type Plan = { plan?: string; message?: string; missions?: { title?: string; brief?: string; agent?: string | null; role?: string; kind?: string; effort?: string; due_in_days?: number }[]; question_for_user?: { question?: string; options?: string[] } | null };
  const r = parseJsonReply<Plan>(text);
  if (!r) throw new Error("The lead's plan couldn't be read.");
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) return "Project is gone.";
  const [lead] = await db.select().from(opsAgents).where(eq(opsAgents.id, leadId)).limit(1);
  const crew = await db.select().from(opsAgents).where(eq(opsAgents.userId, userId));
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
    // Delegated by name: that crew member gets it (whatever their role); else anyone with the role.
    const who = m.agent ? crew.find((a) => a.name.toLowerCase() === String(m.agent).trim().toLowerCase()) : undefined;
    await db.insert(opsMissions).values({
      userId, day: t, projectId, title, brief: String(m.brief ?? "").slice(0, 3000) || null, kind, role: who ? null : role, agentId: who?.id ?? null, effort, dueDay: addDays(t, due),
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

const FINAL_SYSTEM = `You are the lead of a project at Galaxus Ops, writing the FINAL RESULT for the user (a student in Sarajevo, tight budget). Markdown.
Deliver what the GOAL asked for, from what the crew actually delivered — not a plan for the user to do it themselves.
If the goal was a list/sheet: the merged sheet is attached automatically below your text (its row count is given). Write a short cover: how many rows, by category, how they were checked, the gap to the target if any (e.g. "120 of 200"), and what to do next with them. Do not repeat the rows.
Otherwise: lead with the answer in 2-3 sentences, then the details with numbers (KM where relevant), what supports it (cite results), and the next 3 actions.
Say plainly what's still unknown. Reply with only the result.`;

/** Every delivered result of a project, full text (for merging tables and the final). */
async function projectResults(userId: number, projectId: number) {
  return db.select({ title: opsMissions.title, deliverable: opsMissions.deliverable }).from(opsMissions)
    .where(and(eq(opsMissions.userId, userId), eq(opsMissions.projectId, projectId), inArray(opsMissions.status, ["done", "submitted"]), sql`${opsMissions.deliverable} is not null`))
    .orderBy(opsMissions.id);
}

/** The project's merged sheet: every table row the crew delivered, deduplicated. [] if it isn't that kind of project. */
export async function projectSheetFor(userId: number, projectId: number) {
  const [p] = await db.select({ id: opsProjects.id, title: opsProjects.title }).from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) throw new Error("Project not found.");
  return { title: p.title, rows: mergeTables((await projectResults(userId, projectId)).map((r) => r.deliverable ?? "")) };
}

export async function buildProjectFinalPrompt(userId: number, projectId: number) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) throw new Error("Project not found.");
  const [brief, sheet] = await Promise.all([projectBrief(userId, p), projectSheetFor(userId, projectId)]);
  const rows = sheet.rows.length ? sheet.rows.length - 1 : 0;
  const attached = rows
    ? `\n\nTHE MERGED SHEET (attached automatically): ${rows} rows, columns: ${sheet.rows[0].join(" | ")}.\nFirst rows:\n${sheet.rows.slice(1, 8).map((r) => `- ${r.join(" | ")}`).join("\n")}`
    : "";
  return { system: FINAL_SYSTEM, prompt: `${brief.text}${attached}` };
}

export async function applyProjectFinalResult(userId: number, projectId: number, text: string) {
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, projectId), eq(opsProjects.userId, userId))).limit(1);
  if (!p) return "Project is gone.";
  await finishProject(userId, p, text);
  return `${p.title}: final solution ready`;
}

async function finishProject(userId: number, p: OpsProject, md: string) {
  const { rows } = await projectSheetFor(userId, p.id);
  if (p.pageId) {
    const { appendMarkdownToPage } = await import("@/lib/services/ops-deliver");
    const cell = (c: string) => c.replace(/\|/g, "/").replace(/\s+/g, " ");
    const table = rows.length > 1 ? `\n\n## The sheet (${rows.length - 1} rows · download it as Excel from the project in Ops)\n${rows.slice(0, 301).map((r, i) => `| ${r.map(cell).join(" | ")} |${i === 0 ? `\n|${r.map(() => "---").join("|")}|` : ""}`).join("\n")}` : "";
    await appendMarkdownToPage(userId, p.pageId, "Final result", `${md.trim()}${table}`.slice(0, 40_000));
  }
  await db.update(opsProjects).set({ status: "done", finalAt: new Date() }).where(eq(opsProjects.id, p.id));
  const { remember, compress } = await import("@/lib/services/ops-memory");
  // The goal is reached: unpin it, and remember the outcome.
  await remember(userId, { type: "goal", title: `Project: ${p.title} (done)`, body: p.goal, source: `project:${p.id}`, projectId: p.id, pinned: false }).catch(() => null);
  await remember(userId, { type: "decision", title: `Final solution: ${p.title}`, body: compress(md, 1500), source: `project-final:${p.id}`, projectId: p.id }).catch(() => null);
  const { pushFor } = await import("@/lib/services/ops-inbox");
  await pushFor(userId, "report", true, `Project done: ${p.title}`, rows.length > 1 ? `${rows.length - 1} rows in the sheet. Download it in Ops → Projects.` : "The final result is on the project page.", `ops-project-${p.id}`);
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

/** Everything project-shaped on a beat: plan today or finish (while the shift is on, or when it ends), report at the end of the day. */
export async function projectsTickFor(userId: number, o: { shiftOn: boolean; shiftEnded: boolean }) {
  const active = await db.select().from(opsProjects).where(and(eq(opsProjects.userId, userId), eq(opsProjects.status, "active")));
  let planned = 0, reported = 0;
  for (const p of active) {
    if (o.shiftEnded && (await reportProjectDayFor(userId, p))) reported++;
    if ((o.shiftOn || o.shiftEnded) && (await planProjectDayFor(userId, p, { dayEnded: o.shiftEnded }))) planned++;
  }
  return { planned, reported };
}

/** "Keep going": a finished (or overdue) project runs N more days; the lead plans again today. */
export async function extendProjectFor(userId: number, id: number, days: number) {
  const n = Math.round(Number(days));
  if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error("Extend by 1 to 30 days.");
  const [p] = await db.select().from(opsProjects).where(and(eq(opsProjects.id, id), eq(opsProjects.userId, userId))).limit(1);
  if (!p) throw new Error("Project not found.");
  if (p.status === "cancelled") throw new Error("That project was cancelled.");
  const t = today();
  const from = String(p.deadline) > t ? String(p.deadline) : t;
  const [row] = await db.update(opsProjects).set({ status: "active", deadline: addDays(from, n), finalAt: null, lastPlannedDay: null })
    .where(eq(opsProjects.id, id)).returning();
  await planProjectDayFor(userId, row);
  return row;
}
