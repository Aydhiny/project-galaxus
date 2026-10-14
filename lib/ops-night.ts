// Night shift: while you sleep, the crew keeps working, on free models only.
// Pure rules (tested in ops-night.test.ts); lib/services/ops-night.ts applies them.
//
// "Night" is your sleep window (bedtime → wake time from Sleep Guardian, or
// 23:00–07:00 if you never set them), in your timezone. A shift you set
// explicitly always wins: a night shift only covers time that isn't on shift.

import { addDays, inQuietHours } from "@/lib/ops";

export const DEFAULT_BED = "23:00";
export const DEFAULT_WAKE = "07:00";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Your sleep window: your bed/wake times if they look like "23:30", else 23:00–07:00. */
export function sleepWindow(s: { bed?: string | null; wake?: string | null } | null | undefined) {
  const bed = s?.bed && HHMM.test(s.bed) ? s.bed : DEFAULT_BED;
  const wake = s?.wake && HHMM.test(s.wake) ? s.wake : DEFAULT_WAKE;
  return bed === wake ? { bed: DEFAULT_BED, wake: DEFAULT_WAKE } : { bed, wake };
}

/** Is the night shift working right now? Only if you turned it on, you're asleep, and you're not on a shift you set. */
export function nightShiftNow(o: { enabled: boolean; hhmm: string; bed?: string | null; wake?: string | null; shiftState: "on" | "off" | "none" }) {
  if (!o.enabled || o.shiftState === "on") return false;
  const w = sleepWindow(o);
  return inQuietHours(o.hhmm, w.bed, w.wake);
}

/**
 * Which engine may a cloud agent use at night? Never Claude (your plan's budget
 * stays untouched): "auto" and "free" agents go to free models, "claude"-only
 * agents sleep until morning. (Finder "FIND:" missions need no model at all and
 * run before routing, at night too: they cost $0.)
 */
export function nightRoute(o: { engine: string; freeReady: boolean }): "free" | "none" {
  if (o.engine === "claude") return "none";
  return o.freeReady ? "free" : "none";
}

/** The local day you wake up into: before wake time it's today, after bedtime (before midnight) it's tomorrow. */
export function wakeDay(localDay: string, hhmm: string, wake: string) {
  return hhmm < wake ? localDay : addDays(localDay, 1);
}

/**
 * May the night shift plan a project's day now? The project planner plans per
 * UTC day (one plan per UTC date, see ops-projects.ts), so planning at night
 * only makes sense once the UTC date IS the day you wake up into: then the
 * morning finds that day already planned and doesn't plan it again. Before that
 * (e.g. 23:30 in Sarajevo, still yesterday in UTC) planning would just repeat
 * the day that is ending.
 */
export function nightPlanDue(o: { utcDay: string; localDay: string; hhmm: string; wake?: string | null }) {
  return o.utcDay === wakeDay(o.localDay, o.hhmm, sleepWindow({ wake: o.wake }).wake);
}

/** Your clock in a timezone: "HH:MM", the local "YYYY-MM-DD", and the UTC day Ops keys missions by. */
export function clockIn(tz: string, d = new Date()) {
  const utcDay = d.toISOString().slice(0, 10);
  try {
    const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    return { hhmm, localDay, utcDay };
  } catch {
    return { hhmm: d.toISOString().slice(11, 16), localDay: utcDay, utcDay };
  }
}

/** The morning line in your inbox (and the debrief). */
export function nightSummary(o: { done: number; stillOpen?: number }) {
  const s = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (o.done === 0) return `Night shift: no missions finished overnight${o.stillOpen ? ` (${s(o.stillOpen, "mission")} still open)` : ""}. Nothing was spent.`;
  return `Night shift: ${s(o.done, "mission")} done on free models while you slept. $0 of your Claude plan used.${o.stillOpen ? ` ${s(o.stillOpen, "mission")} still open.` : ""}`;
}
