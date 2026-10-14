// The working day, automated: recurring missions post themselves, the crew
// stands up at the start of the shift (your cloud Chief plans what's missing),
// and when the shift ends you get a one-page debrief in Pages plus a push.
// opsTickFor runs on every scheduler beat (~10 min) and is safe to repeat.

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsDays, opsEvents, opsMessages, opsMissions, opsRecurring, outreachSettings, type OpsDay } from "@/lib/db/schema";
import {
  MISSION_KINDS, MISSION_KIND_INFO, ROLES, ROLE_KEYS, describeRepeat, formatUsd, hhmmIn, presence, recurringDue, roleOf, shiftEnded, shiftStatus, standupDue, weekdayOf,
  type MissionKind, type RoleKey,
} from "@/lib/ops";

async function tzFor(userId: number) {
  const [s] = await db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  return s?.tz ?? "Europe/Sarajevo";
}
/** "YYYY-MM-DD" in a timezone (for which weekday it is where you are). */
function localDayIn(tz: string, d = new Date()) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}
/** The day key Ops uses everywhere (missions, shifts): the same one as lib/services/ops.ts. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const dayIn = (_tz?: string) => new Date().toISOString().slice(0, 10);
const shiftDay = (d: string, delta: number) => new Date(Date.parse(`${d}T12:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const cents = (n: number) => formatUsd(n);

/** A cloud Chief of staff that can think for the stand-up and the debrief, if you have one (Claude or a free model runs it). */
async function cloudChief(userId: number) {
  const [chief] = await db.select().from(opsAgents).where(and(eq(opsAgents.userId, userId), eq(opsAgents.cloud, true), eq(opsAgents.role, "chief"))).limit(1);
  return chief ?? null;
}

// ─── Recurring missions ───────────────────────────────────────────────────────

/** Post today's copy of every recurring mission that is due. Returns how many were posted. */
export async function postDueRecurringFor(userId: number) {
  const tz = await tzFor(userId);
  const day = dayIn(tz), hhmm = hhmmIn(tz), weekday = weekdayOf(localDayIn(tz));
  const due = (await db.select().from(opsRecurring).where(and(eq(opsRecurring.userId, userId), eq(opsRecurring.active, true))))
    .filter((r) => recurringDue({ ...r, lastPostedDay: r.lastPostedDay ? String(r.lastPostedDay) : null }, { day, hhmm, weekday }));
  let posted = 0;
  for (const r of due) {
    // Claim the day first (so two beats can't both post it).
    const [won] = await db.update(opsRecurring).set({ lastPostedDay: day })
      .where(and(eq(opsRecurring.id, r.id), or(isNull(opsRecurring.lastPostedDay), sql`${opsRecurring.lastPostedDay} <> ${day}`))).returning();
    if (!won) continue;
    await db.insert(opsMissions).values({
      userId, day, title: r.title, brief: r.brief, kind: r.kind, role: r.agentId ? null : r.role, agentId: r.agentId, budgetCents: r.budgetCents, recurringId: r.id,
    });
    posted++;
  }
  return posted;
}

// ─── Stand-up ─────────────────────────────────────────────────────────────────

/**
 * The morning stand-up: the crew gathers at the holo table (the 3D scene plays
 * it), you get a one-message summary on the radio, and a cloud Chief (if you
 * have one) plans what's missing for today's focus.
 */
export async function standupFor(userId: number, opts: { manual?: boolean } = {}) {
  const tz = await tzFor(userId);
  const day = dayIn(tz);
  const [row] = await db.select().from(opsDays).where(and(eq(opsDays.userId, userId), eq(opsDays.day, day))).limit(1);
  if (row?.standupAt && !opts.manual) return { done: false };
  if (row) await db.update(opsDays).set({ standupAt: new Date() }).where(eq(opsDays.id, row.id));

  const [missions, agents] = await Promise.all([
    db.select().from(opsMissions).where(and(eq(opsMissions.userId, userId), inArray(opsMissions.status, ["open", "claimed", "submitted"]))).orderBy(opsMissions.id).limit(60),
    db.select().from(opsAgents).where(eq(opsAgents.userId, userId)),
  ]);
  const open = missions.filter((m) => m.status === "open"), doing = missions.filter((m) => m.status === "claimed"), review = missions.filter((m) => m.status === "submitted");
  const name = (id: number | null) => agents.find((a) => a.id === id)?.name ?? "someone";
  const lines = [
    `Stand-up${row?.focus ? ` · Focus: ${row.focus}` : ""}`,
    `On the board: ${open.length} open, ${doing.length} in progress, ${review.length} waiting for review.`,
    ...doing.slice(0, 5).map((m) => `• ${name(m.agentId)} is on "${m.title}"`),
    ...open.slice(0, 5).map((m) => `• Open: "${m.title}" for ${m.agentId ? name(m.agentId) : m.role ? `any ${ROLES[roleOf(m.role)].label}` : "anyone"}`),
    `Crew online: ${agents.filter((a) => presence(a) !== "offline").map((a) => a.name).join(", ") || "nobody yet"}.`,
  ];
  await db.insert(opsMessages).values({ userId, fromAgentId: null, body: lines.join("\n").slice(0, 2000) });

  const chief = await cloudChief(userId);
  const { runPlannerJob } = await import("@/lib/services/ops-free");
  const planned = chief ? await runPlannerJob(userId, "ops_standup", "Planning today's stand-up", { day, chiefId: chief.id }, { agentId: chief.id }).catch(() => null) : null;
  return { done: true, planned: !!planned };
}

export async function buildStandupPrompt(userId: number, chiefId: number) {
  const tz = await tzFor(userId);
  const day = dayIn(tz);
  const [[row], board, crew] = await Promise.all([
    db.select().from(opsDays).where(and(eq(opsDays.userId, userId), eq(opsDays.day, day))).limit(1),
    db.select({ title: opsMissions.title, status: opsMissions.status, role: opsMissions.role }).from(opsMissions)
      .where(and(eq(opsMissions.userId, userId), inArray(opsMissions.status, ["open", "claimed", "submitted"]))).limit(40),
    db.select({ name: opsAgents.name, role: opsAgents.role, cloud: opsAgents.cloud }).from(opsAgents).where(eq(opsAgents.userId, userId)),
  ]);
  const system = `You are the Chief of staff at Galaxus Ops, planning the user's working day at the morning stand-up. The user lives in Sarajevo, Bosnia and Herzegovina.
Reply with ONLY a JSON object, no other text:
{"message": "2-4 short lines for the crew: today's priorities and who does what", "missions": [{"title": "...", "brief": "what a good result looks like", "kind": "${MISSION_KINDS.join("|")}", "role": "${ROLE_KEYS.join("|")}", "budget_usd": 0}]}
Add at most 4 missions, and only what is MISSING to reach today's focus — never duplicate what is already on the board. Each budget at most 5. Missions are research, writing and planning work; never sending, buying or deploying.`;
  const prompt = [
    `Today is ${day}. Shift: ${row ? `${row.startsAt}–${row.endsAt}` : "not set"}.`,
    `Focus: ${row?.focus ?? "(none set — keep the board moving, add nothing unless clearly useful)"}`,
    `Crew: ${crew.map((c) => `${c.name} (${ROLES[roleOf(c.role)].label}${c.cloud ? ", cloud" : ""})`).join("; ")}`,
    `Board:\n${board.map((m) => `- [${m.status}] ${m.title}${m.role ? ` (${m.role})` : ""}`).join("\n") || "- empty"}`,
    `You are agent #${chiefId}.`,
  ].join("\n");
  return { system, prompt };
}

export async function applyStandupResult(userId: number, chiefId: number, text: string) {
  const { parseJsonReply } = await import("@/lib/claude-jobs");
  const r = parseJsonReply<{ message?: string; missions?: { title?: string; brief?: string; kind?: string; role?: string; budget_usd?: number }[] }>(text);
  if (!r) throw new Error("The Chief's plan couldn't be read.");
  const [chief] = await db.select().from(opsAgents).where(and(eq(opsAgents.id, chiefId), eq(opsAgents.userId, userId))).limit(1);
  const day = dayIn(await tzFor(userId));
  let added = 0, total = 0;
  for (const m of (r.missions ?? []).slice(0, 4)) {
    const title = String(m.title ?? "").trim().slice(0, 200);
    if (title.length < 3) continue;
    const kind: MissionKind = MISSION_KINDS.includes(m.kind as MissionKind) ? (m.kind as MissionKind) : "other";
    const role: RoleKey = ROLE_KEYS.includes(m.role as RoleKey) ? (m.role as RoleKey) : MISSION_KIND_INFO[kind].role;
    const budget = Math.max(0, Math.min(5, Number(m.budget_usd) || 0));
    if (total + budget > 15) break; // the Chief can't commit more than $15 of your money at a stand-up
    total += budget;
    await db.insert(opsMissions).values({ userId, day, title, brief: String(m.brief ?? "").slice(0, 2000) || null, kind, role, budgetCents: budget ? Math.round(budget * 100) : null, createdByAgentId: chief?.id ?? null });
    added++;
  }
  if (chief && r.message) await db.insert(opsMessages).values({ userId, fromAgentId: chief.id, body: String(r.message).slice(0, 2000) });
  const { dispatchCloudFor } = await import("@/lib/services/ops");
  await dispatchCloudFor(userId).catch(() => {});
  return `Stand-up: ${added} mission${added === 1 ? "" : "s"} added by the Chief`;
}

// ─── Debrief ──────────────────────────────────────────────────────────────────

/** The facts of a working day as markdown (no Claude needed). */
export async function debriefMarkdown(userId: number, day: string) {
  const [missions, agents, waiting, nextRecurring] = await Promise.all([
    db.select().from(opsMissions).where(and(eq(opsMissions.userId, userId), or(eq(opsMissions.day, day), inArray(opsMissions.status, ["open", "claimed", "submitted"])))).orderBy(opsMissions.id),
    db.select().from(opsAgents).where(eq(opsAgents.userId, userId)),
    db.select({ agentId: opsEvents.agentId, label: opsEvents.label }).from(opsEvents)
      .where(and(eq(opsEvents.userId, userId), eq(opsEvents.kind, "waiting"), sql`${opsEvents.at} >= now() - interval '24 hours'`)).orderBy(desc(opsEvents.at)).limit(5),
    db.select().from(opsRecurring).where(and(eq(opsRecurring.userId, userId), eq(opsRecurring.active, true))),
  ]);
  const name = (id: number | null) => agents.find((a) => a.id === id)?.name ?? "—";
  const todays = missions.filter((m) => String(m.day) === day);
  const done = todays.filter((m) => m.status === "done"), review = missions.filter((m) => m.status === "submitted");
  const doing = missions.filter((m) => m.status === "claimed"), open = missions.filter((m) => m.status === "open");
  const spent = todays.reduce((s, m) => s + m.spentCents, 0), measured = todays.filter((m) => m.costMeasured).reduce((s, m) => s + m.spentCents, 0);
  const budget = todays.reduce((s, m) => s + (m.budgetCents ?? 0), 0);
  const tomorrow = shiftDay(day, 1), wd = weekdayOf(tomorrow);
  const list = (ms: typeof missions, f: (m: (typeof missions)[number]) => string) => (ms.length ? ms.map((m) => `- ${f(m)}`).join("\n") : "- nothing");
  return [
    `# Debrief · ${day}`,
    `${done.length} accepted · ${review.length} waiting for your review · ${doing.length} in progress · ${open.length} open`,
    `Spent ${cents(spent)}${budget ? ` of ${cents(budget)} budgeted` : ""} (${cents(measured)} measured from real runs, the rest reported by agents).`,
    `## Done`, list(done, (m) => `${m.title} (${name(m.submittedBy)}, ${cents(m.spentCents)})`),
    `## Waiting for your review`, list(review, (m) => `${m.title} (${name(m.submittedBy ?? m.agentId)})`),
    `## Blocked or still running`, list(doing, (m) => `${m.title} (${name(m.agentId)})`),
    ...(waiting.length ? [`## Agents that waited for you`, waiting.map((w) => `- ${name(w.agentId)}: ${w.label}`).join("\n")] : []),
    `## Tomorrow`,
    list(open.slice(0, 10), (m) => `${m.title}${m.role ? ` (any ${ROLES[roleOf(m.role)].label})` : m.agentId ? ` (${name(m.agentId)})` : ""}`),
    ...nextRecurring.filter((r) => r.days[wd] === "1").map((r) => `- [repeats] ${r.title} (${describeRepeat(r.days, r.time)})`),
  ].join("\n\n");
}

/** Write the day's debrief page, push it, and (with a cloud Chief) ask for the Chief's notes on top. */
export async function debriefFor(userId: number, row: Pick<OpsDay, "id" | "day"> | null, dayOverride?: string) {
  const day = row ? String(row.day) : dayOverride ?? dayIn(await tzFor(userId));
  if (row) {
    // Claim it first, so two beats can't both write a debrief.
    const [won] = await db.update(opsDays).set({ debriefAt: new Date() }).where(and(eq(opsDays.id, row.id), isNull(opsDays.debriefAt))).returning();
    if (!won) return null;
  }
  const md = await debriefMarkdown(userId, day);
  const { createPageFromMarkdown } = await import("@/lib/services/ops-deliver");
  const pageId = await createPageFromMarkdown(userId, `Ops debrief · ${day}`, md, { icon: "📋" });
  if (row) await db.update(opsDays).set({ debriefPageId: pageId }).where(eq(opsDays.id, row.id));
  const { pushFor } = await import("@/lib/services/ops-inbox");
  await pushFor(userId, "report", false, "Your Ops debrief is ready", md.split("\n\n")[1] ?? "", `ops-debrief-${day}`);
  const chief = await cloudChief(userId);
  if (chief) {
    const { runPlannerJob } = await import("@/lib/services/ops-free");
    await runPlannerJob(userId, "ops_debrief", "Writing the debrief", { pageId, day }, { agentId: chief.id }).catch(() => null);
  }
  return pageId;
}

export async function buildDebriefPrompt(userId: number, day: string) {
  return {
    system: `You are the Chief of staff at Galaxus Ops. Write short notes on top of today's debrief for the user (Sarajevo). Markdown, max 200 words: what went well, what's at risk, and the 3 most important things for tomorrow. Plain, direct, no filler. Reply with only the notes.`,
    prompt: await debriefMarkdown(userId, day),
  };
}

export async function applyDebriefResult(userId: number, pageId: number, text: string) {
  const { appendMarkdownToPage } = await import("@/lib/services/ops-deliver");
  await appendMarkdownToPage(userId, pageId, "Chief's notes", text.trim().slice(0, 6000));
  return "Chief's notes added to the debrief";
}

// ─── The beat ─────────────────────────────────────────────────────────────────

/** Everything time-driven in Ops, once per scheduler beat. */
export async function opsTickFor(userId: number) {
  const tz = await tzFor(userId);
  const day = dayIn(tz), now = hhmmIn(tz);
  const posted = await postDueRecurringFor(userId);
  const { refreshAboutMeIfStale } = await import("@/lib/services/ops-memory");
  await refreshAboutMeIfStale(userId).catch(() => false);
  const [[today], [yesterday]] = await Promise.all([
    db.select().from(opsDays).where(and(eq(opsDays.userId, userId), eq(opsDays.day, day))).limit(1),
    db.select().from(opsDays).where(and(eq(opsDays.userId, userId), eq(opsDays.day, shiftDay(day, -1)))).limit(1),
  ]);
  let standup = false, debriefs = 0;
  if (standupDue(today ?? null, now)) standup = (await standupFor(userId)).done;
  if (shiftEnded(today ?? null, now, "today") && (await debriefFor(userId, today))) debriefs++;
  if (shiftEnded(yesterday ?? null, now, "yesterday") && (await debriefFor(userId, yesterday))) debriefs++;
  // Projects: plan each day while the shift is on (or from 08:00 with no shift); report when it ends (or at 21:00).
  const on = today ? shiftStatus(today, now).state === "on" : now >= "08:00" && now < "21:00";
  const ended = today ? shiftEnded({ ...today, debriefAt: null }, now, "today") : now >= "21:00";
  const { projectsTickFor } = await import("@/lib/services/ops-projects");
  const projects = await projectsTickFor(userId, { shiftOn: on, shiftEnded: ended });
  const { dispatchCloudFor } = await import("@/lib/services/ops");
  const dispatch = await dispatchCloudFor(userId);
  return { posted, standup, debriefs, projects, ...dispatch };
}
