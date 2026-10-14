// The Chief reviews every result like a manager would: does it move us toward
// the goal (the project's goal, or the mission's own aim)? Then it either
//   accept   — hands it to you, with a short note on why it's good,
//   continue — files this step as done and gives the same agent the next step,
//   redo     — sends it back to the agent with what to fix.
// Up to MAX_REVIEW_ROUNDS steps on one line of work; after that, you decide.
// Reviews are cheap (Haiku, or a free model first if you said "free first").

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsMessages, opsMissions, opsProjects, type OpsAgent, type OpsMission } from "@/lib/db/schema";
import { MAX_REVIEW_ROUNDS, ROLES, parseReview, roleOf } from "@/lib/ops";

const today = () => new Date().toISOString().slice(0, 10);

/** Who reviews: the project's lead if it's a cloud agent, else your cloud Chief of staff. Never the agent itself. */
async function reviewerFor(m: OpsMission, submittedBy: number) {
  if (m.projectId) {
    const [p] = await db.select({ lead: opsProjects.leadAgentId }).from(opsProjects).where(eq(opsProjects.id, m.projectId)).limit(1);
    if (p?.lead && p.lead !== submittedBy) {
      const [lead] = await db.select().from(opsAgents).where(eq(opsAgents.id, p.lead)).limit(1);
      if (lead?.cloud) return lead;
    }
  }
  const chiefs = await db.select().from(opsAgents).where(and(eq(opsAgents.userId, m.userId), eq(opsAgents.role, "chief"), eq(opsAgents.cloud, true)));
  return chiefs.find((c) => c.id !== submittedBy) ?? null;
}

/** Called when an agent submits. Starts a review if there's a Chief and rounds are left. Never throws. */
export async function requestReview(userId: number, missionId: number, submittedBy: number) {
  try {
    const [m] = await db.select().from(opsMissions).where(and(eq(opsMissions.id, missionId), eq(opsMissions.userId, userId))).limit(1);
    if (!m || m.status !== "submitted" || m.requestFromLabel) return null; // someone else's request: it goes back to them as is
    const chief = await reviewerFor(m, submittedBy);
    if (!chief) return null;
    if (m.reviewRound >= MAX_REVIEW_ROUNDS) {
      await db.update(opsMissions).set({ chiefNote: `${MAX_REVIEW_ROUNDS} rounds on this already — your call now.` }).where(eq(opsMissions.id, m.id));
      return null;
    }
    const { runPlannerJob } = await import("@/lib/services/ops-free");
    return await runPlannerJob(userId, "ops_review", `Reviewing "${m.title}"`.slice(0, 120), { missionId: m.id, chiefId: chief.id }, { preferFree: true, agentId: chief.id });
  } catch { return null; }
}

const SYSTEM = `You are the Chief of staff at Galaxus Ops. An agent on your crew just handed in a result. Review it like a good manager:
judge it against THE GOAL (not against perfection), and keep the work moving toward it. The user is a student in Sarajevo on a tight budget.
Agents can search and read the web; they can't log in anywhere, call anyone, or spend money.
Reply with ONLY a JSON object:
{"verdict": "accept" | "continue" | "redo",
 "progress": 0-100 (how close this line of work is to the goal),
 "note": "1-3 sentences for the user: what this result is worth and what happens next",
 "feedback": "to the agent: what was good, what was missing, concretely",
 "next": {"title": "the next concrete step", "brief": "exactly what to produce, what a good result looks like", "effort": "quick|normal|deep"} or null}
accept   = it reaches the goal (or is as far as agents can take it): it goes to the user.
continue = useful, but the goal isn't reached: give the SAME agent the next step (it builds on this result).
redo     = it misses the point: the agent tries again with your feedback.
A result that only explains how the user could do it themselves is NOT the goal when an agent could do it: "continue" with a step that does it.
Be specific and small: one next step at a time.`;

export async function buildReviewPrompt(userId: number, missionId: number, chiefId: number) {
  const [m] = await db.select().from(opsMissions).where(and(eq(opsMissions.id, missionId), eq(opsMissions.userId, userId))).limit(1);
  if (!m || m.status !== "submitted" || !m.deliverable) throw new Error("This result is no longer waiting for review.");
  const [[agent], [chief], project, chain] = await Promise.all([
    db.select().from(opsAgents).where(eq(opsAgents.id, m.submittedBy ?? -1)).limit(1),
    db.select().from(opsAgents).where(eq(opsAgents.id, chiefId)).limit(1),
    m.projectId ? db.select().from(opsProjects).where(eq(opsProjects.id, m.projectId)).limit(1).then((r) => r[0] ?? null) : null,
    lineOfWork(m),
  ]);
  const { memoryBrief } = await import("@/lib/services/ops-memory");
  const memory = await memoryBrief(userId, `${m.title} ${project?.goal ?? ""}`, 1200).catch(() => "");
  const root = chain[0] ?? m;
  const goal = project ? `PROJECT GOAL: ${project.goal} (deadline ${String(project.deadline)})` : `GOAL (what the user asked for): ${root.title}${root.brief ? ` — ${root.brief.slice(0, 1500)}` : ""}`;
  const prompt = [
    `You are ${chief?.name ?? "the Chief"}. Today is ${today()}.`,
    goal,
    memory ? `\nWHAT WE KNOW ABOUT THE USER:\n${memory}` : "",
    chain.length > 1 ? `\nSTEPS SO FAR ON THIS LINE OF WORK:\n${chain.slice(0, -1).map((c, i) => `${i + 1}. "${c.title}"${c.chiefNote ? ` — your note: ${c.chiefNote}` : ""}`).join("\n")}` : "",
    `\nTHIS STEP: "${m.title}" (round ${m.reviewRound + 1} of ${MAX_REVIEW_ROUNDS}), by ${agent?.name ?? "an agent"} (${agent ? ROLES[roleOf(agent.role)].label : "agent"}).`,
    m.brief ? `It was asked to: ${m.brief.slice(0, 1500)}` : "",
    `\nTHE RESULT:\n${m.deliverable.slice(0, 9000)}`,
    m.reviewRound + 1 >= MAX_REVIEW_ROUNDS ? "\nThis is the last round: accept unless it's clearly unusable." : "",
  ].filter(Boolean).join("\n");
  return { system: SYSTEM, prompt };
}

/** The missions on one line of work, oldest first (each "continue" step's parent is the step before). */
async function lineOfWork(m: OpsMission) {
  const chain: OpsMission[] = [m];
  let cur = m;
  for (let i = 0; i < MAX_REVIEW_ROUNDS + 1 && cur.parentId && cur.reviewRound > 0; i++) {
    const [p] = await db.select().from(opsMissions).where(eq(opsMissions.id, cur.parentId)).limit(1);
    if (!p) break;
    chain.unshift(p);
    cur = p;
  }
  return chain;
}

export async function applyReviewResult(userId: number, missionId: number, chiefId: number, text: string) {
  const { parseJsonReply } = await import("@/lib/claude-jobs");
  const r = parseReview(parseJsonReply(text));
  if (!r) throw new Error("The Chief's review couldn't be read.");
  const [m] = await db.select().from(opsMissions).where(and(eq(opsMissions.id, missionId), eq(opsMissions.userId, userId))).limit(1);
  if (!m || m.status !== "submitted") return "The result was already handled.";
  const [chief] = await db.select().from(opsAgents).where(eq(opsAgents.id, chiefId)).limit(1);
  const [agent] = m.submittedBy ? await db.select().from(opsAgents).where(eq(opsAgents.id, m.submittedBy)).limit(1) : [];
  const progress = r.progress != null ? ` (${r.progress}% of the way)` : "";
  const ops = await import("@/lib/services/ops");

  if (r.verdict === "accept") {
    await db.update(opsMissions).set({ chiefNote: `✓ ${r.note}${progress}` }).where(eq(opsMissions.id, m.id));
    await radio(userId, chief, agent, m.id, `Good work on "${m.title}". ${r.feedback}`.trim());
    const { pushFor } = await import("@/lib/services/ops-inbox");
    await pushFor(userId, "delivered", false, `${chief?.name ?? "Chief"}: ready for you`, `${m.title} — ${r.note}`.slice(0, 160), `ops-review-${m.id}`);
    return `Chief accepted "${m.title}"`;
  }

  if (r.verdict === "redo") {
    // Back to the same agent, with the Chief's feedback in the brief.
    await db.update(opsMissions).set({
      status: "open", claimedAt: null, submittedAt: null, jobId: null, agentId: m.submittedBy ?? m.agentId, role: null,
      reviewRound: m.reviewRound + 1, chiefNote: `↺ ${r.note}`,
      brief: `${m.brief ?? ""}\n\n— ${chief?.name ?? "The Chief"} sent it back (round ${m.reviewRound + 1}): ${r.feedback}\nYour previous result, to improve on:\n${(m.deliverable ?? "").slice(0, 2500)}`.trim().slice(0, 6000),
    }).where(eq(opsMissions.id, m.id));
    await radio(userId, chief, agent, m.id, `"${m.title}" needs another pass: ${r.feedback}`);
    await ops.dispatchCloudFor(userId).catch(() => {});
    return `Chief sent "${m.title}" back`;
  }

  // continue: this step is filed as done (it counts toward the goal); the same agent gets the next step.
  await db.update(opsMissions).set({ status: "done", chiefNote: `→ ${r.note}${progress}` }).where(eq(opsMissions.id, m.id));
  const { remember, compress } = await import("@/lib/services/ops-memory");
  await remember(userId, { type: "finding", title: m.deliverableTitle || m.title, body: compress(m.deliverable ?? ""), source: `deliverable:${m.id}`, projectId: m.projectId, agentId: m.submittedBy }).catch(() => null);
  const next = r.next!;
  const [step] = await db.insert(opsMissions).values({
    userId, day: today(), title: next.title, kind: m.kind, effort: next.effort, projectId: m.projectId, dueDay: m.dueDay,
    agentId: m.submittedBy ?? m.agentId, role: null, parentId: m.id, createdByAgentId: chief?.id ?? null, reviewRound: m.reviewRound + 1,
    budgetCents: m.budgetCents != null ? Math.max(0, m.budgetCents - m.spentCents) : null,
    brief: `${next.brief}\n\n— From ${chief?.name ?? "the Chief"}: ${r.feedback}\nBuild on your previous step "${m.title}":\n${(m.deliverable ?? "").slice(0, 2500)}`.trim().slice(0, 6000),
  }).returning();
  await radio(userId, chief, agent, step.id, `Next for you: "${next.title}". ${r.feedback}`);
  await ops.dispatchCloudFor(userId).catch(() => {});
  return `Chief gave the next step: "${next.title}"`;
}

async function radio(userId: number, chief: OpsAgent | undefined, agent: OpsAgent | undefined, missionId: number, body: string) {
  if (!chief) return;
  await db.insert(opsMessages).values({ userId, fromAgentId: chief.id, toAgentId: agent?.id ?? null, missionId, body: body.slice(0, 2000) });
}
