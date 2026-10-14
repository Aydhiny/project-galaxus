// The inbox: agents talking to YOU. They ask questions (with quick answers),
// send updates, and every push to your phone goes through one policy: your
// mode (urgent / normal / all), quiet hours (your Sleep Guardian bed/wake
// times) and a daily cap, so a crew working all day doesn't spam you.
// Answering a question tells the agent; a mission that waited on it resumes.
//
// Also home to your Ops settings: the monthly cloud budget, the model, and the
// pause when Claude reports a usage limit.

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsMessages, opsMissions, opsSettings, outreachSettings, userSettings, voiceCommands, type OpsAgent } from "@/lib/db/schema";
import {
  CLOUD_MODELS, NOTIFY_LEVELS, dailyAllowance, hhmmIn, parseQuestion, redact, shouldPush, usageLimitPause,
  type CloudModel, type NotifyLevel, type PushKind,
} from "@/lib/ops";

const MAX_QUESTIONS_PER_AGENT_DAY = 10;
const MAX_UPDATES_PER_AGENT_DAY = 20;
const today = () => new Date().toISOString().slice(0, 10);

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function opsSettingsFor(userId: number) {
  await db.insert(opsSettings).values({ userId }).onConflictDoNothing();
  const [s] = await db.select().from(opsSettings).where(eq(opsSettings.userId, userId)).limit(1);
  return s;
}

export async function saveOpsSettingsFor(userId: number, raw: { monthlyBudgetUsd?: unknown; cloudModel?: unknown; notify?: unknown; maxPushesPerDay?: unknown; freeFallback?: unknown; freeFirst?: unknown }) {
  await opsSettingsFor(userId);
  const set: Partial<typeof opsSettings.$inferInsert> = { updatedAt: new Date() };
  if (raw.monthlyBudgetUsd !== undefined) {
    const usd = Number(raw.monthlyBudgetUsd);
    if (!Number.isFinite(usd) || usd < 0 || usd > 500) throw new Error("Monthly budget must be between $0 and $500.");
    set.monthlyBudgetCents = Math.round(usd * 100);
  }
  if (raw.cloudModel !== undefined) {
    if (!CLOUD_MODELS.includes(raw.cloudModel as CloudModel)) throw new Error("Pick Haiku, Sonnet or Opus.");
    set.cloudModel = raw.cloudModel as CloudModel;
  }
  if (raw.notify !== undefined) {
    if (!NOTIFY_LEVELS.includes(raw.notify as NotifyLevel)) throw new Error("Pick how often to notify you.");
    set.notify = raw.notify as NotifyLevel;
  }
  if (raw.freeFallback !== undefined) set.freeFallback = !!raw.freeFallback;
  if (raw.freeFirst !== undefined) set.freeFirst = !!raw.freeFirst;
  if (raw.maxPushesPerDay !== undefined) {
    const n = Number(raw.maxPushesPerDay);
    if (!Number.isInteger(n) || n < 0 || n > 50) throw new Error("Pushes per day: 0 to 50.");
    set.maxPushesPerDay = n;
  }
  await db.update(opsSettings).set(set).where(eq(opsSettings.userId, userId));
}

export async function resumeCloudFor(userId: number) {
  await opsSettingsFor(userId);
  await db.update(opsSettings).set({ pausedUntil: null, pauseReason: null }).where(eq(opsSettings.userId, userId));
}

/** Claude reported a usage/rate limit: stop starting cloud runs until it resets. */
export async function noteJobErrorFor(userId: number, error: string | null) {
  const ms = usageLimitPause(error);
  if (!ms) return false;
  await opsSettingsFor(userId);
  await db.update(opsSettings).set({ pausedUntil: new Date(Date.now() + ms), pauseReason: String(error ?? "").slice(0, 300) }).where(eq(opsSettings.userId, userId));
  await pushFor(userId, "report", true, "Cloud agents paused", "Your Claude plan hit a usage limit. They resume by themselves when it resets.", "ops-paused");
  return true;
}

/** This month's and today's measured cloud spend (every Claude job counts), and what's left today. */
export async function budgetFor(userId: number) {
  const s = await opsSettingsFor(userId);
  const day = today();
  const monthStart = new Date(`${day.slice(0, 7)}-01T00:00:00Z`), dayStart = new Date(`${day}T00:00:00Z`);
  const [row] = await db.select({
    month: sql<number>`coalesce(sum(${voiceCommands.costCents}), 0)::int`,
    today: sql<number>`coalesce(sum(${voiceCommands.costCents}) filter (where ${voiceCommands.finishedAt} >= ${dayStart}), 0)::int`,
    runsToday: sql<number>`count(*) filter (where ${voiceCommands.finishedAt} >= ${dayStart})::int`,
  }).from(voiceCommands).where(and(eq(voiceCommands.userId, userId), gte(voiceCommands.finishedAt, monthStart)));
  const a = dailyAllowance({ monthlyBudgetCents: s.monthlyBudgetCents, spentMonthCents: row?.month ?? 0, spentTodayCents: row?.today ?? 0, day });
  const paused = s.pausedUntil && s.pausedUntil.getTime() > Date.now() ? { until: s.pausedUntil, reason: s.pauseReason } : null;
  return {
    monthlyBudgetCents: s.monthlyBudgetCents, spentMonthCents: row?.month ?? 0, spentTodayCents: row?.today ?? 0, runsToday: row?.runsToday ?? 0,
    ...a, model: s.cloudModel as CloudModel, notify: s.notify as NotifyLevel, maxPushesPerDay: s.maxPushesPerDay, paused,
    freeFallback: s.freeFallback, freeFirst: s.freeFirst,
  };
}
export type OpsBudget = Awaited<ReturnType<typeof budgetFor>>;

// ─── Push policy ──────────────────────────────────────────────────────────────

/** Push to your phone if your settings allow it right now. Returns whether it went out. Never throws. */
export async function pushFor(userId: number, kind: PushKind, urgent: boolean, title: string, body: string, tag: string) {
  try {
    const s = await opsSettingsFor(userId);
    const [[sleep], [tzRow]] = await Promise.all([
      db.select({ on: userSettings.sleepEnabled, bed: userSettings.bedTime, wake: userSettings.wakeTime }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1),
    ]);
    const day = today();
    const sentToday = s.pushDay && String(s.pushDay) === day ? s.pushCount : 0;
    const ok = shouldPush({
      level: s.notify as NotifyLevel, kind, urgent, hhmm: hhmmIn(tzRow?.tz ?? "Europe/Sarajevo"),
      bed: sleep?.on ? sleep.bed : null, wake: sleep?.on ? sleep.wake : null, sentToday, max: s.maxPushesPerDay,
    });
    if (!ok) return false;
    await db.update(opsSettings).set({ pushDay: day, pushCount: sentToday + 1 }).where(eq(opsSettings.userId, userId));
    const { notifyUser } = await import("@/lib/services/outreach/push");
    await notifyUser(userId, { title: title.slice(0, 80), body: body.slice(0, 160), url: "/ops?inbox=1", tag });
    return true;
  } catch {
    return false; // a notification problem must never break an agent's work
  }
}

// ─── Agents → you ─────────────────────────────────────────────────────────────

async function sentTodayBy(agentId: number, kind: "question" | "update") {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMessages)
    .where(and(eq(opsMessages.fromAgentId, agentId), eq(opsMessages.toUser, true), eq(opsMessages.kind, kind), gte(opsMessages.at, new Date(`${today()}T00:00:00Z`))));
  return n;
}

/**
 * An agent asks you something. `blocking`: the mission it's on waits for your
 * answer (cloud agents always block — they can't wait mid-run).
 */
export async function askUserForAgent(agent: OpsAgent, input: { question: unknown; options?: unknown; urgent?: boolean; missionId?: number | null; blocking?: boolean }) {
  const q = parseQuestion({ question: input.question, options: input.options });
  if ((await sentTodayBy(agent.id, "question")) >= MAX_QUESTIONS_PER_AGENT_DAY) throw new Error(`That's ${MAX_QUESTIONS_PER_AGENT_DAY} questions today. Decide yourself and note the assumption in your deliverable.`);
  let missionId: number | null = null;
  if (input.missionId) {
    const [m] = await db.select({ id: opsMissions.id }).from(opsMissions).where(and(eq(opsMissions.id, input.missionId), eq(opsMissions.userId, agent.userId))).limit(1);
    missionId = m?.id ?? null;
  }
  const [row] = await db.insert(opsMessages).values({
    userId: agent.userId, fromAgentId: agent.id, toUser: true, kind: "question", urgent: !!input.urgent, options: q.options.length ? q.options : null, missionId, body: q.question,
  }).returning();
  if (input.blocking && missionId) await db.update(opsMissions).set({ waitingOn: row.id }).where(eq(opsMissions.id, missionId));
  const { recordEventForAgent } = await import("@/lib/services/ops");
  await recordEventForAgent(agent, { kind: "message", label: `Asked you: ${q.question}`.slice(0, 200), url: null, status: input.blocking ? "waiting" : "working" }, { missionId });
  await pushFor(agent.userId, "question", !!input.urgent || !!input.blocking, `${agent.name} asks`, q.question, `ops-q-${row.id}`);
  return { asked: true, id: row.id, note: "The user's answer arrives in ops_get_messages. Keep working on anything that doesn't depend on it." };
}

/** An agent tells you something worth knowing (a finding, progress, a heads-up). */
export async function notifyUserForAgent(agent: OpsAgent, input: { text: unknown; urgent?: boolean; missionId?: number | null }) {
  const text = redact(String(input.text ?? "")).replace(/\s+/g, " ").trim().slice(0, 600);
  if (text.length < 3) throw new Error("Say something.");
  if ((await sentTodayBy(agent.id, "update")) >= MAX_UPDATES_PER_AGENT_DAY) throw new Error("That's enough updates for today. Put the rest in your deliverable.");
  const [row] = await db.insert(opsMessages).values({ userId: agent.userId, fromAgentId: agent.id, toUser: true, kind: "update", urgent: !!input.urgent, missionId: input.missionId ?? null, body: text }).returning();
  await pushFor(agent.userId, "update", !!input.urgent, `${agent.name}`, text, `ops-u-${row.id}`);
  return { sent: true };
}

/** You answer. The agent gets it on its radio; a mission that waited on it picks up again with the answer in its brief. */
export async function answerFor(userId: number, messageId: number, answerRaw: string) {
  const answer = redact(String(answerRaw ?? "")).trim().slice(0, 2000);
  if (!answer) throw new Error("Write an answer.");
  const [q] = await db.update(opsMessages).set({ answer, answeredAt: new Date(), readAt: new Date() })
    .where(and(eq(opsMessages.id, messageId), eq(opsMessages.userId, userId), eq(opsMessages.toUser, true), eq(opsMessages.kind, "question"), isNull(opsMessages.answeredAt))).returning();
  if (!q) throw new Error("That question is already answered (or gone).");
  if (q.fromAgentId) await db.insert(opsMessages).values({ userId, fromAgentId: null, toAgentId: q.fromAgentId, missionId: q.missionId, body: `Answer to your question "${q.body.slice(0, 200)}": ${answer}` });
  // Every answer is a decision all agents should know about (shared memory).
  const { remember } = await import("@/lib/services/ops-memory");
  await remember(userId, { type: "decision", title: q.body.slice(0, 200), body: `Asked: ${q.body}\nYou decided: ${answer}`, source: `answer:${q.id}`, agentId: q.fromAgentId }).catch(() => null);
  const waiting = await db.select().from(opsMissions).where(and(eq(opsMissions.userId, userId), eq(opsMissions.waitingOn, q.id)));
  // "Leave it" / "Cancel": the waiting mission stops instead of resuming.
  if (/^(leave it|cancel( it)?|skip( it)?|stop)$/i.test(answer)) {
    for (const m of waiting) await db.update(opsMissions).set({ waitingOn: null, status: "cancelled" }).where(eq(opsMissions.id, m.id));
    return { resumed: 0 };
  }
  for (const m of waiting) {
    await db.update(opsMissions).set({ waitingOn: null, brief: `${m.brief ?? ""}\n\nYou asked: ${q.body}\nThe user answered: ${answer}`.trim() }).where(eq(opsMissions.id, m.id));
  }
  if (waiting.length) {
    const { dispatchCloudFor } = await import("@/lib/services/ops");
    await dispatchCloudFor(userId).catch(() => {});
  }
  return { resumed: waiting.length };
}

export async function markReadFor(userId: number, ids: number[]) {
  for (const id of ids.slice(0, 100)) await db.update(opsMessages).set({ readAt: new Date() }).where(and(eq(opsMessages.id, id), eq(opsMessages.userId, userId), eq(opsMessages.toUser, true)));
}

/** Your inbox: unanswered questions first, then recent updates. */
export async function inboxFor(userId: number) {
  const rows = await db.select({ m: opsMessages, agent: opsAgents.name, provider: opsAgents.provider, cloud: opsAgents.cloud }).from(opsMessages)
    .leftJoin(opsAgents, eq(opsAgents.id, opsMessages.fromAgentId))
    .where(and(eq(opsMessages.userId, userId), eq(opsMessages.toUser, true)))
    .orderBy(sql`(${opsMessages.kind} = 'question' and ${opsMessages.answeredAt} is null) desc`, desc(opsMessages.at)).limit(60);
  return rows.map(({ m, agent, provider, cloud }) => ({
    id: m.id, kind: m.kind as "question" | "update", body: m.body, options: m.options ?? [], urgent: m.urgent, missionId: m.missionId,
    answer: m.answer, answeredAt: m.answeredAt, readAt: m.readAt, at: m.at, agentId: m.fromAgentId, agent: agent ?? "Agent", provider: provider ?? "other", cloud: !!cloud,
  }));
}
export type OpsInboxItem = Awaited<ReturnType<typeof inboxFor>>[number];
