// Full autonomy: agents' questions go to the Chief, and the Chief decides
// right away, so the crew never waits on you. Only spending, contacting real
// people, legal/account/irreversible steps and your private data still come to
// you (lib/ops-autonomy.ts classifies), and at most one of those a day buzzes
// your phone; the rest wait in "Needs you".
//
// The Chief is your cloud Chief of staff; without one, Galaxus decides. It thinks
// on a free model first, else Claude (a small "ops_chief_decide" job), else a
// fixed rule. The decision is applied exactly like your own answer (answerFor):
// the mission resumes, the agent hears it on the radio, and it's remembered.
// You see every decision in the Inbox and can change it afterwards.

import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { opsAgents, opsMessages, opsMissions, type OpsAgent } from "@/lib/db/schema";
import {
  autonomyOf, chiefDecidePrompt, classifyQuestion, digestLine, isLeaveIt, isRetryQuestion, parseChiefDecision, routeQuestion, ruleDecision,
  type QuestionRoute,
} from "@/lib/ops-autonomy";
import { redact } from "@/lib/ops";

const today = () => new Date().toISOString().slice(0, 10);
const dayStart = (d = today()) => new Date(`${d}T00:00:00Z`);

/** Your cloud Chief of staff, or null (then Galaxus itself decides). */
export async function cloudChiefFor(userId: number) {
  const [c] = await db.select().from(opsAgents).where(and(eq(opsAgents.userId, userId), eq(opsAgents.role, "chief"), eq(opsAgents.cloud, true))).orderBy(opsAgents.id).limit(1);
  return c ?? null;
}

/** Where a new question goes (see routeQuestion). */
export async function routeQuestionFor(userId: number, q: { question: string; options: string[]; context?: string | null; urgent: boolean; toUser?: boolean }): Promise<QuestionRoute> {
  const { opsSettingsFor } = await import("@/lib/services/ops-inbox");
  const s = await opsSettingsFor(userId);
  const mode = autonomyOf(s.autonomy);
  if (mode === "ask" || q.toUser) return "direct";
  const category = classifyQuestion(q);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMessages)
    .where(and(eq(opsMessages.userId, userId), eq(opsMessages.kind, "question"), eq(opsMessages.route, "user"), eq(opsMessages.urgent, false), gte(opsMessages.at, dayStart())));
  return routeQuestion({ mode, category, urgent: q.urgent, userAskedToday: n });
}

/** Start the Chief's decision on a question (after the response; tests and scripts run it inline). Never throws. */
export async function scheduleChiefDecision(userId: number, messageId: number, context?: string | null) {
  const work = () => decideFor(userId, messageId, context).catch(() => null);
  try { after(work); } catch { await work(); }
}

/**
 * The Chief decides one question: free model → Claude (queued; applied when it finishes) → rule.
 * Returns how it was (or will be) decided, or null if the question was already answered.
 */
export async function decideFor(userId: number, messageId: number, context?: string | null): Promise<"free" | "claude" | "rule" | null> {
  const q = await pendingChiefQuestion(userId, messageId);
  if (!q) return null;
  // "Try again / Leave it" needs no judgment: the rule (once, then leave it) also stops a model from retrying forever.
  if (!isRetryQuestion(q.options ?? [])) {
    try {
      const { freeStatusFor, askFree } = await import("@/lib/services/free-llm");
      if ((await freeStatusFor(userId)).usableCount > 0) {
        const p = await buildChiefDecidePrompt(userId, messageId, context);
        const r = await askFree(userId, { ...p, maxTokens: 700 });
        const d = parseChiefDecision(r.text, q.options ?? []);
        if (d && (await applyChiefDecision(userId, messageId, d.answer, d.why, r.name))) return "free";
      }
    } catch { /* every free model failed: Claude, then the rule */ }
    const chief = await cloudChiefFor(userId);
    const { runPlannerJob } = await import("@/lib/services/ops-free");
    // runPlannerJob takes Claude when it can (or a free model when Claude can't); with neither,
    // plannerJobFailed → decideByRuleFor. A Claude decision lands in applyChiefDecisionResult.
    const how = await runPlannerJob(userId, "ops_chief_decide", `Deciding: ${q.body}`.slice(0, 120), { messageId, context: context ?? null }, { agentId: chief?.id ?? null }).catch(() => null);
    if (how === "claude") return "claude";
    if (how === "free") return "free";
  }
  await decideByRuleFor(userId, messageId);
  return "rule";
}

async function pendingChiefQuestion(userId: number, messageId: number) {
  const [q] = await db.select().from(opsMessages).where(and(eq(opsMessages.id, messageId), eq(opsMessages.userId, userId), eq(opsMessages.kind, "question"), eq(opsMessages.route, "chief"), isNull(opsMessages.answeredAt))).limit(1);
  return q ?? null;
}

/** The fixed rule, when no model could decide. Never throws. */
export async function decideByRuleFor(userId: number, messageId: number) {
  try {
    const q = await pendingChiefQuestion(userId, messageId);
    if (!q) return false;
    let retriesDecided = 0;
    if (q.missionId && isRetryQuestion(q.options ?? [])) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMessages)
        .where(and(eq(opsMessages.userId, userId), eq(opsMessages.missionId, q.missionId), eq(opsMessages.route, "chief"), sql`lower(${opsMessages.chiefAnswer}) = 'try again'`));
      retriesDecided = n;
    }
    const d = ruleDecision({ question: q.body, options: q.options ?? [], retriesDecided });
    return await applyChiefDecision(userId, messageId, d.answer, d.why, "rule");
  } catch { return false; }
}

/** The Chief's prompt for a question (free model, or the ops_chief_decide job on Claude). */
export async function buildChiefDecidePrompt(userId: number, messageId: number, context?: string | null) {
  const [row] = await db.select({ m: opsMessages, agent: opsAgents.name }).from(opsMessages).leftJoin(opsAgents, eq(opsAgents.id, opsMessages.fromAgentId))
    .where(and(eq(opsMessages.id, messageId), eq(opsMessages.userId, userId))).limit(1);
  if (!row) throw new Error("That question is gone.");
  const q = row.m;
  const [mission] = q.missionId ? await db.select().from(opsMissions).where(and(eq(opsMissions.id, q.missionId), eq(opsMissions.userId, userId))).limit(1) : [];
  const { directionsBlock } = await import("@/lib/services/ops-directions");
  const { memoryBrief } = await import("@/lib/services/ops-memory");
  const { projectContext } = await import("@/lib/services/ops-projects");
  const [directions, memory, project] = await Promise.all([
    directionsBlock(userId).catch(() => ""),
    memoryBrief(userId, `${q.body} ${mission?.title ?? ""}`, 1500).catch(() => ""),
    mission?.projectId ? projectContext(userId, mission.projectId).catch(() => null) : null,
  ]);
  return chiefDecidePrompt({
    agent: row.agent ?? "An agent", question: q.body, options: q.options ?? [],
    mission: mission ? { title: mission.title, brief: mission.brief } : null, project: project ? { title: project.title, goal: project.goal } : null,
    directions, memory, context,
  });
}

/** Claude's (or a free model's, via runPlannerJob) answer to an ops_chief_decide job. Throws when unreadable, so the rule takes over. */
export async function applyChiefDecisionResult(userId: number, messageId: number, text: string) {
  const q = await pendingChiefQuestion(userId, messageId);
  if (!q) return "Already decided";
  const d = parseChiefDecision(text, q.options ?? []);
  if (!d) throw new Error("The Chief's decision couldn't be read.");
  await applyChiefDecision(userId, messageId, d.answer, d.why, "Claude");
  return `The Chief decided: ${d.answer}`.slice(0, 200);
}

/** Apply a decision through answerFor (the same path as your own answer). Returns false if it was already answered. */
async function applyChiefDecision(userId: number, messageId: number, answer: string, why: string, engine: string) {
  const chief = await cloudChiefFor(userId);
  const { answerFor } = await import("@/lib/services/ops-inbox");
  try {
    await answerFor(userId, messageId, answer, { chief, why, engine });
    return true;
  } catch { return false; } // you (or another beat) answered first
}

/**
 * You change a decision the Chief made. The agent hears the correction, the shared memory is
 * corrected, and the mission is re-briefed: a mission that already moved on (delivered, or left)
 * goes back on the board with your answer; "Leave it" stops one that hasn't finished.
 */
export async function changeDecisionFor(userId: number, messageId: number, answerRaw: string) {
  const answer = redact(String(answerRaw ?? "")).trim().slice(0, 2000);
  if (!answer) throw new Error("Write an answer.");
  const [q] = await db.select().from(opsMessages)
    .where(and(eq(opsMessages.id, messageId), eq(opsMessages.userId, userId), eq(opsMessages.kind, "question"), eq(opsMessages.route, "chief"), isNotNull(opsMessages.answeredAt))).limit(1);
  if (!q) throw new Error("Only a decision the Chief already made can be changed.");
  if (q.answer === answer) return { changed: false, reopened: false };
  const chiefSaid = q.chiefAnswer ?? q.answer ?? "";
  await db.update(opsMessages).set({ answer, changedAt: new Date(), readAt: new Date() }).where(eq(opsMessages.id, q.id));
  if (q.fromAgentId) {
    await db.insert(opsMessages).values({ userId, fromAgentId: null, toAgentId: q.fromAgentId, missionId: q.missionId, body: `Correction to "${q.body.slice(0, 200)}": the user's answer is ${answer} (not ${chiefSaid}).` });
  }
  const { remember } = await import("@/lib/services/ops-memory");
  await remember(userId, { type: "decision", title: q.body.slice(0, 200), body: `Asked: ${q.body}\nThe Chief decided: ${chiefSaid}\nYou changed it to: ${answer}`, source: `chief-decided:${q.id}`, agentId: q.fromAgentId, touch: true }).catch(() => null);

  let reopened = false;
  const [m] = q.missionId ? await db.select().from(opsMissions).where(and(eq(opsMissions.id, q.missionId), eq(opsMissions.userId, userId))).limit(1) : [];
  if (m) {
    if (isLeaveIt(answer)) {
      // Stop it, unless it's already delivered (then there's nothing left to stop).
      if (m.status === "open" || m.status === "claimed") await db.update(opsMissions).set({ status: "cancelled", waitingOn: null }).where(eq(opsMissions.id, m.id));
    } else {
      // Same "You asked / The user answered" shape as answerFor, so agents (and the finder's city lookup) read the newest answer.
      const brief = `${m.brief ?? ""}\n\nCorrection from the user (replaces the Chief's answer "${chiefSaid.slice(0, 200)}"):\nYou asked: ${q.body}\nThe user answered: ${answer}`.trim();
      const movedOn = m.status === "submitted" || m.status === "done" || m.status === "cancelled";
      await db.update(opsMissions).set({ brief, waitingOn: null, ...(movedOn ? { status: "open", claimedAt: null, jobId: null } : {}) }).where(eq(opsMissions.id, m.id));
      reopened = movedOn;
      if (movedOn) {
        const { dispatchCloudFor } = await import("@/lib/services/ops");
        await dispatchCloudFor(userId).catch(() => {});
      }
    }
  }
  return { changed: true, reopened };
}

/** Questions the Chief should have decided but didn't (the function running it died): decide by rule. Every beat. */
export async function healChiefQuestionsFor(userId: number) {
  const stuck = await db.select({ id: opsMessages.id }).from(opsMessages)
    .where(and(eq(opsMessages.userId, userId), eq(opsMessages.kind, "question"), eq(opsMessages.route, "chief"), isNull(opsMessages.answeredAt), lt(opsMessages.at, new Date(Date.now() - 15 * 60_000)))).limit(20);
  let n = 0;
  for (const s of stuck) if (await decideByRuleFor(userId, s.id)) n++;
  return n;
}

/** The "Decided for you" digest for a day: what the Chief decided, and how many questions need you now. */
export async function decisionsDigestFor(userId: number, day = today()) {
  const from = dayStart(day), to = new Date(from.getTime() + 86_400_000);
  const [decided, [{ needs }]] = await Promise.all([
    db.select({ body: opsMessages.body, answer: opsMessages.answer, chiefAnswer: opsMessages.chiefAnswer, changedAt: opsMessages.changedAt, agent: opsAgents.name }).from(opsMessages)
      .leftJoin(opsAgents, eq(opsAgents.id, opsMessages.fromAgentId))
      .where(and(eq(opsMessages.userId, userId), eq(opsMessages.kind, "question"), eq(opsMessages.route, "chief"), gte(opsMessages.answeredAt, from), lt(opsMessages.answeredAt, to)))
      .orderBy(opsMessages.answeredAt),
    db.select({ needs: sql<number>`count(*)::int` }).from(opsMessages)
      .where(and(eq(opsMessages.userId, userId), eq(opsMessages.toUser, true), eq(opsMessages.kind, "question"), isNull(opsMessages.answeredAt), or(isNull(opsMessages.route), inArray(opsMessages.route, ["user", "held"])))),
  ]);
  return { decided: decided.length, needsYou: needs, line: digestLine(decided.length, needs), items: decided };
}

/** The digest as debrief markdown ("" when the Chief decided nothing that day). */
export async function decisionsDigestMarkdown(userId: number, day: string) {
  const d = await decisionsDigestFor(userId, day).catch(() => null);
  if (!d || !d.decided) return "";
  const rows = d.items.slice(0, 12).map((x) => `- ${x.agent ?? "Galaxus"}: ${x.body.slice(0, 160)} → **${(x.chiefAnswer ?? x.answer ?? "").slice(0, 120)}**${x.changedAt ? ` (you changed it to: ${(x.answer ?? "").slice(0, 120)})` : ""}`);
  return [`## Decided for you`, `${d.line} Change any of them in the Inbox.`, rows.join("\n")].join("\n\n");
}

/** The agent that asked, for answerFor's chief path. */
export type ChiefAnswer = { chief: OpsAgent | null; why: string; engine: string };
