// Replay of a day on /ops: pure reconstruction (tested in ops-replay.test.ts).
// Given a day's events, missions and radio messages, what did the floor look
// like at time T? Who was working on what, each agent's presence, and where each
// mission stood on the board. Nothing here touches the network or DB.
//
// Presence uses the same rule as the live view (presence() in lib/ops.ts), fed
// with the agent's state as it was at T: its last status-changing event is its
// "status", and that event's time is its "last seen".

import { presence, presenceNote, type Presence } from "@/lib/ops";

export type ReplayEvent = {
  id: number; agentId: number; missionId: number | null; kind: string; label: string; url: string | null; at: number;
  /** The agent's status this event set; "note" = a system note that leaves presence alone; null = recorded before the column existed. */
  status?: string | null;
};
export type ReplayMission = {
  id: number; title: string; day: string; status: string; agentId: number | null;
  budgetCents: number | null; spentCents: number; createdAt: number; claimedAt: number | null; submittedAt: number | null;
};
export type ReplayMessage = { id: number; from: number | null; to: number | null; team: string | null; external: "in" | "out" | null; partner: string | null; at: number };
export type ReplayDay = {
  day: string; from: number; to: number;
  /** Each agent's last event before the day started, so the replay opens on the right state. */
  seeds: ReplayEvent[];
  events: ReplayEvent[];
  missions: ReplayMission[];
  messages: ReplayMessage[];
  capped: boolean;
};
export type ReplayAgentState = { presence: Presence; activity: string | null; activityKind: string | null; activityUrl: string | null; statusNote: string };

export const REPLAY_MAX_EVENTS = 2500;
export const REPLAY_MAX_MESSAGES = 800;
export const REPLAY_MAX_MISSIONS = 150;
export const REPLAY_DAYS = 3; // ops_events are kept 3 days

/**
 * The status an event set on its agent. New events carry it; older ones are
 * read from their kind and label (the same words lib/services/ops.ts writes).
 * null = a note about the agent (you accepted / sent back its work) that leaves its presence alone.
 */
export function eventStatus(e: Pick<ReplayEvent, "kind" | "label" | "status">): string | null {
  if (e.status === "note") return null;
  if (e.status) return e.status;
  if (/^(Accepted|Sent back|Lost the head-to-head):/.test(e.label)) return null;
  if (e.kind === "waiting") return "waiting";
  if (e.kind !== "status") return "working";
  if (/^(Couldn't finish|Can't think right now)|back on the board/.test(e.label)) return "error";
  if (/^(Took the mission|Got a new task)/.test(e.label)) return "working";
  return "idle"; // came online, finished, submitted, planner done
}

/** How a mission moved, from what was recorded about it. */
type Step = { at: number; status: string; agentId: number | null };
function missionSteps(m: ReplayMission, events: ReplayEvent[]): Step[] {
  const steps: Step[] = [{ at: m.createdAt, status: "open", agentId: null }];
  for (const e of events) {
    if (e.missionId !== m.id || e.kind !== "status") continue;
    const s = /^Took the mission/.test(e.label) ? "claimed"
      : /^Submitted:/.test(e.label) ? "submitted"
      : /^Accepted:/.test(e.label) ? "done"
      : /^Sent back:/.test(e.label) ? "open"
      : /^Lost the head-to-head:/.test(e.label) ? "cancelled"
      : /^Couldn't finish|back on the board/.test(e.label) ? "open" : null;
    if (s) steps.push({ at: e.at, status: s, agentId: s === "open" ? null : e.agentId });
  }
  // The row's own timestamps fill gaps (events can be missing: purged, or the agent never reported).
  if (m.claimedAt && !steps.some((s) => s.status === "claimed" && Math.abs(s.at - m.claimedAt!) < 5_000)) steps.push({ at: m.claimedAt, status: "claimed", agentId: m.agentId });
  if (m.submittedAt && !steps.some((s) => s.status === "submitted" && Math.abs(s.at - m.submittedAt!) < 5_000)) steps.push({ at: m.submittedAt, status: "submitted", agentId: m.agentId });
  return steps.sort((a, b) => a.at - b.at);
}

/** Each mission's status at T, as the board showed it: hidden before it was posted, and yesterday's finished work off the board. */
export function missionsAt(day: Pick<ReplayDay, "day" | "from" | "missions" | "events">, t: number) {
  const out: (Pick<ReplayMission, "id" | "title" | "budgetCents" | "spentCents"> & { status: string; agentId: number | null; since: number })[] = [];
  for (const m of day.missions) {
    if (m.createdAt > t) continue;
    // Cancelled work never shows (like the live board); we don't know when it was cancelled.
    if (m.status === "cancelled") continue;
    const all = missionSteps(m, day.events);
    // An earlier day's mission that's done, with no acceptance recorded today: it was finished before this day.
    if (m.status === "done" && m.day !== day.day && !all.some((s) => s.status === "done")) continue;
    const steps = all.filter((s) => s.at <= t);
    const last = steps[steps.length - 1];
    const status = last.status;
    // Done work stays on the board for the day it was finished (mission day keys are UTC dates; the replay's day is yours).
    if (status === "cancelled" || (status === "done" && m.day !== day.day && last.at < day.from)) continue;
    // Spend isn't recorded over time: it shows once the work is delivered.
    out.push({ id: m.id, title: m.title, budgetCents: m.budgetCents, spentCents: status === "submitted" || status === "done" ? m.spentCents : 0, status, agentId: last.agentId, since: last.at });
  }
  return out;
}

/** Every agent's state at T: presence (the live rule, at that moment), what it was doing, and the line under its name. */
export function agentsAt(day: Pick<ReplayDay, "day" | "from" | "missions" | "events" | "seeds">, agents: { id: number; cloud?: boolean }[], t: number) {
  const last = new Map<number, ReplayEvent>();
  for (const e of [...day.seeds, ...day.events]) {
    if (e.at > t || eventStatus(e) === null) continue;
    const prev = last.get(e.agentId);
    if (!prev || e.at > prev.at || (e.at === prev.at && e.id > prev.id)) last.set(e.agentId, e);
  }
  const held = missionsAt(day, t).filter((m) => m.status === "claimed" && m.agentId != null);
  const out = new Map<number, ReplayAgentState>();
  for (const a of agents) {
    const e = last.get(a.id);
    const holding = held.find((m) => m.agentId === a.id);
    const row = { status: e ? eventStatus(e)! : "idle", lastSeenAt: e ? new Date(e.at) : null, cloud: a.cloud, activity: e?.label ?? null };
    const p = presence(row, t, { holdingSince: holding ? new Date(holding.since) : null });
    out.set(a.id, {
      presence: p,
      activity: e?.label ?? null, activityKind: e?.kind ?? null, activityUrl: e?.url ?? null,
      statusNote: presenceNote(p, row, t, true),
    });
  }
  return out;
}

/** Radio messages sent in (a, b]: what flies while the replay plays from a to b. Capped so a jump can't fire a storm. */
export function messagesBetween(messages: ReplayMessage[], a: number, b: number, max = 6) {
  if (b <= a) return [];
  return messages.filter((m) => m.at > a && m.at <= b).slice(-max);
}

/** Moments worth a mark on the timeline: errors (red) and people needing you (rose). */
export function replayMarks(day: Pick<ReplayDay, "events" | "from" | "to">, max = 120) {
  const span = Math.max(1, day.to - day.from);
  return day.events
    .filter((e) => { const s = eventStatus(e); return s === "error" || s === "waiting"; })
    .slice(0, max)
    .map((e) => ({ id: e.id, at: e.at, kind: eventStatus(e) as "error" | "waiting", pct: Math.max(0, Math.min(100, ((e.at - day.from) / span) * 100)) }));
}

/** Midnight of a YYYY-MM-DD day in a timezone, in ms (DST-safe to the hour; good enough to bound a day). */
export function dayStartIn(day: string, tz: string): number {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const offsetAt = (ms: number) => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - ms;
    } catch {
      return 0;
    }
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first); // second pass: the offset at the real midnight (DST days)
}

/** YYYY-MM-DD of an instant in a timezone. */
export function dayKeyIn(ms: number, tz: string) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

/** The days a replay can show (events are kept 3 days), newest first. */
export function replayDays(now: number, tz: string) {
  return Array.from({ length: REPLAY_DAYS }, (_, i) => dayKeyIn(now - i * 86_400_000, tz)).filter((d, i, all) => all.indexOf(d) === i);
}

/** "14:32" in a timezone. */
export function hhmmAt(ms: number, tz: string) {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(11, 16); }
}
