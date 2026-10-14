// Replay of a day on /ops: one compact, time-ordered load of what happened.
// Only your own rows, only the chosen day, capped (lib/ops-replay.ts has the
// limits and the pure reconstruction the page plays it with).

import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsEvents, opsMessages, opsMissions, outreachSettings } from "@/lib/db/schema";
import { REPLAY_MAX_EVENTS, REPLAY_MAX_MESSAGES, REPLAY_MAX_MISSIONS, dayStartIn, replayDays, type ReplayDay, type ReplayEvent } from "@/lib/ops-replay";

const ms = (d: Date | null) => (d ? d.getTime() : null);

export async function replayDayFor(userId: number, day: string): Promise<ReplayDay> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw new Error("Pick a day.");
  const [s] = await db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  const tz = s?.tz ?? "Europe/Sarajevo";
  // Events are kept 3 days: older days have nothing to show.
  if (!replayDays(Date.now(), tz).includes(day)) throw new Error("Replays go back 3 days (that's how long the floor's history is kept).");
  const from = dayStartIn(day, tz);
  const to = Math.min(dayStartIn(nextDay(day), tz), Date.now());
  const [f, t] = [new Date(from), new Date(to)];

  const evCols = { id: opsEvents.id, agentId: opsEvents.agentId, missionId: opsEvents.missionId, kind: opsEvents.kind, label: opsEvents.label, url: opsEvents.url, status: opsEvents.status, at: opsEvents.at };
  const [events, seeds, messages] = await Promise.all([
    db.select(evCols).from(opsEvents).where(and(eq(opsEvents.userId, userId), gte(opsEvents.at, f), lt(opsEvents.at, t)))
      .orderBy(asc(opsEvents.at), asc(opsEvents.id)).limit(REPLAY_MAX_EVENTS + 1),
    // Each agent's last word before the day began, so the replay opens on how things stood.
    db.selectDistinctOn([opsEvents.agentId], evCols).from(opsEvents).where(and(eq(opsEvents.userId, userId), lt(opsEvents.at, f)))
      .orderBy(opsEvents.agentId, desc(opsEvents.at), desc(opsEvents.id)),
    // The radio: agent ↔ agent and yours. Questions to you (the inbox) don't fly across the floor.
    db.select({ id: opsMessages.id, from: opsMessages.fromAgentId, to: opsMessages.toAgentId, team: opsMessages.toTeam, extFrom: opsMessages.extFrom, extTo: opsMessages.extTo, at: opsMessages.at })
      .from(opsMessages).where(and(eq(opsMessages.userId, userId), eq(opsMessages.toUser, false), gte(opsMessages.at, f), lt(opsMessages.at, t)))
      .orderBy(asc(opsMessages.at), asc(opsMessages.id)).limit(REPLAY_MAX_MESSAGES + 1),
  ]);
  // The board that day: that day's missions, anything touched that day, and earlier work still unfinished by its end.
  const touched = [...new Set(events.map((e) => e.missionId).filter((x): x is number => x != null))].slice(0, REPLAY_MAX_MISSIONS);
  const missions = await db.select({
    id: opsMissions.id, title: opsMissions.title, day: opsMissions.day, status: opsMissions.status, agentId: opsMissions.agentId,
    budgetCents: opsMissions.budgetCents, spentCents: opsMissions.spentCents, createdAt: opsMissions.createdAt, claimedAt: opsMissions.claimedAt, submittedAt: opsMissions.submittedAt,
  }).from(opsMissions).where(and(
    eq(opsMissions.userId, userId),
    sql`${opsMissions.createdAt} < ${t}`,
    or(
      eq(opsMissions.day, day),
      ...(touched.length ? [inArray(opsMissions.id, touched)] : []),
      inArray(opsMissions.status, ["open", "claimed", "submitted"]),
    ),
  )).orderBy(desc(opsMissions.id)).limit(REPLAY_MAX_MISSIONS);

  const toEvent = (e: (typeof events)[number]): ReplayEvent => ({ id: e.id, agentId: e.agentId, missionId: e.missionId, kind: e.kind, label: e.label, url: e.url, at: e.at.getTime(), status: e.status });
  return {
    day, from, to,
    seeds: seeds.map(toEvent),
    events: events.slice(0, REPLAY_MAX_EVENTS).map(toEvent),
    missions: missions.reverse().map((m) => ({
      id: m.id, title: m.title, day: String(m.day), status: m.status, agentId: m.agentId, budgetCents: m.budgetCents, spentCents: m.spentCents,
      createdAt: ms(m.createdAt) ?? from, claimedAt: ms(m.claimedAt), submittedAt: ms(m.submittedAt),
    })),
    messages: messages.slice(0, REPLAY_MAX_MESSAGES).map((m) => ({
      id: m.id, from: m.from, to: m.to, team: m.team,
      external: m.extFrom ? ("in" as const) : m.extTo ? ("out" as const) : null, partner: (m.extFrom ?? m.extTo ?? "").split(" / ")[0] || null, at: m.at.getTime(),
    })),
    capped: events.length > REPLAY_MAX_EVENTS || messages.length > REPLAY_MAX_MESSAGES,
  };
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
