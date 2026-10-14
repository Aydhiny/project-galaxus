// The night shift (rules in lib/ops-night.ts): while you sleep, cloud agents
// keep taking open missions, but ONLY on free models (and the $0 business
// finder); Claude is never started at night, so your plan's budget is untouched.
// A project's next day may be planned early (on a free model). In the morning
// your inbox gets one line: "Night shift: N missions done on free models".
//
// Hooks into the rest of Ops are deliberately small:
//   * dispatchCloudFor (lib/services/ops.ts) asks nightShiftActiveFor() when off shift,
//   * runPlannerJob (lib/services/ops-free.ts) asks it before starting Claude,
//   * opsTickFor (lib/services/ops-day.ts) calls nightTickFor() every beat.

import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsAgents, opsDays, opsMessages, opsMissions, opsSettings, outreachSettings, userSettings } from "@/lib/db/schema";
import { inQuietHours, shiftStatus } from "@/lib/ops";
import { opsSettingsFor, pushFor } from "@/lib/services/ops-inbox";
import { clockIn, nightPlanDue, nightShiftNow, nightSummary, sleepWindow } from "@/lib/ops-night";

type ShiftState = "on" | "off" | "none";

/** Everything the night rules need: your toggle, your sleep window, your clock. */
async function nightInputs(userId: number) {
  const [s, [sleep], [tzRow]] = await Promise.all([
    opsSettingsFor(userId),
    db.select({ bed: userSettings.bedTime, wake: userSettings.wakeTime }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({ tz: outreachSettings.timezone }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1),
  ]);
  return { s, window: sleepWindow(sleep), clock: clockIn(tzRow?.tz ?? "Europe/Sarajevo") };
}

/** Today's shift state (the same lookup as ops.ts shiftFor), for callers that don't have it at hand. */
async function shiftStateFor(userId: number, hhmm: string): Promise<ShiftState> {
  const [d] = await db.select().from(opsDays).where(and(eq(opsDays.userId, userId), eq(opsDays.day, new Date().toISOString().slice(0, 10)))).limit(1);
  return shiftStatus(d ?? null, hhmm).state;
}

/** Is the night shift working right now (so: free models only, Claude never)? */
export async function nightShiftActiveFor(userId: number, shiftState?: ShiftState) {
  const { s, window, clock } = await nightInputs(userId);
  if (!s.nightShift) return false;
  return nightShiftNow({ enabled: true, hhmm: clock.hhmm, ...window, shiftState: shiftState ?? (await shiftStateFor(userId, clock.hhmm)) });
}

/**
 * Are you asleep right now (your sleep window), whatever the toggle says? With the night shift OFF,
 * nothing runs then unless you set a shift that covers the night — the runner beats at night now
 * (for the night shift), and without this Claude agents would quietly start working while you sleep.
 */
export async function inSleepWindowFor(userId: number) {
  // Only with a bedtime you set (Sleep Guardian): without one, agents keep the hours they always had.
  const [sleep] = await db.select({ on: userSettings.sleepEnabled, bed: userSettings.bedTime, wake: userSettings.wakeTime }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!sleep?.on || !sleep.bed || !sleep.wake) return false;
  const { window, clock } = await nightInputs(userId);
  return inQuietHours(clock.hhmm, window.bed, window.wake);
}

export async function setNightShiftFor(userId: number, on: boolean) {
  await opsSettingsFor(userId);
  await db.update(opsSettings).set({ nightShift: !!on, updatedAt: new Date() }).where(eq(opsSettings.userId, userId));
}

/**
 * Once per Ops beat. At night: note when the night started, and say whether a
 * project's next day may be planned now (see nightPlanDue). The first beat after
 * the night: post the morning summary to your inbox (exactly once; claimed
 * atomically), and push it per your normal push policy if anything got done.
 */
export async function nightTickFor(userId: number, shiftState: ShiftState) {
  const { s, window, clock } = await nightInputs(userId);
  const active = s.nightShift && nightShiftNow({ enabled: true, hhmm: clock.hhmm, ...window, shiftState });
  if (active) {
    if (!s.nightStartedAt) await db.update(opsSettings).set({ nightStartedAt: new Date() }).where(and(eq(opsSettings.userId, userId), isNull(opsSettings.nightStartedAt)));
    return { active: true, planDue: nightPlanDue({ ...clock, wake: window.wake }), summary: null };
  }
  if (!s.nightStartedAt) return { active: false, planDue: false, summary: null };
  const [won] = await db.update(opsSettings).set({ nightStartedAt: null })
    .where(and(eq(opsSettings.userId, userId), isNotNull(opsSettings.nightStartedAt))).returning();
  if (!won) return { active: false, planDue: false, summary: null };
  const since = s.nightStartedAt;
  const [{ done }] = await db.select({ done: sql<number>`count(*)::int` }).from(opsMissions)
    .where(and(eq(opsMissions.userId, userId), eq(opsMissions.nightShift, true), inArray(opsMissions.status, ["submitted", "done"]), gte(opsMissions.submittedAt, since)));
  const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(opsMissions)
    .where(and(eq(opsMissions.userId, userId), eq(opsMissions.status, "open"), lte(opsMissions.day, clock.utcDay)));
  const text = nightSummary({ done, stillOpen: open });
  // From your Chief of staff if you have one (else the facility itself).
  const [chief] = await db.select({ id: opsAgents.id }).from(opsAgents).where(and(eq(opsAgents.userId, userId), eq(opsAgents.role, "chief"))).limit(1);
  await db.insert(opsMessages).values({ userId, fromAgentId: chief?.id ?? null, toUser: true, kind: "update", body: text });
  if (done > 0) {
    await pushFor(userId, "report", false, "Night shift", text, `ops-night-${clock.localDay}`); // normal policy: never in quiet hours
  }
  return { active: false, planDue: false, summary: text };
}

/** For the debrief: how many of a day's results came from the night shift. */
export async function nightDoneOn(userId: number, day: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opsMissions)
    .where(and(eq(opsMissions.userId, userId), eq(opsMissions.nightShift, true), inArray(opsMissions.status, ["submitted", "done"]), sql`${opsMissions.submittedAt}::date = ${day}`));
  return n;
}
