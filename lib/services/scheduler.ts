// The daily automation scheduler. The GitHub Actions runner calls
// /api/voice/daily every 10 minutes (06:00–23:00 your time); each call runs
// whatever is due, within a time budget, and records when it ran — so a
// missed or doubled beat is harmless.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreachSettings, taskRuns } from "@/lib/db/schema";
import { localNow } from "@/lib/outreach";
import { ensureTodayDigestFor } from "@/lib/services/digest";
import { pruneGigsFor, scanGigsFor } from "@/lib/services/gigs";
import { scanCommunitiesFor } from "@/lib/services/community";
import { syncStripeFor } from "@/lib/services/money";
import { runAutopilotFollowUpsFor, runAutopilotInboxFor, runAutopilotSendFor } from "@/lib/services/autopilot";
import { runRedditDailyFor } from "@/lib/services/reddit";
import {
  checkClientSitesFor, checkLeadSitesFor, ensureDemosFor, findNewBusinessesFor, monthlyReportsReadyFor, queueFollowUpsFor,
} from "@/lib/services/leads-auto";

type Ctx = { day: string; lastRunAt: Date | null; outreachOn: boolean };
type When = { daily: number } | { every: number; from: number; to: number } | { monthly: number };
type Task = { id: string; when: When; needsOutreach?: boolean; run: (userId: number, ctx: Ctx) => Promise<unknown> };

export const TASKS: Task[] = [
  { id: "autopilot_inbox_fast", when: { every: 5, from: 6, to: 24 }, run: (u) => runAutopilotInboxFor(u) },
  { id: "digest", when: { daily: 6 }, run: (u) => ensureTodayDigestFor(u) },
  { id: "gigs", when: { every: 60, from: 6, to: 23 }, run: (u) => scanGigsFor(u) },
  { id: "gigs_prune", when: { daily: 6 }, run: (u) => pruneGigsFor(u) },
  { id: "community", when: { daily: 11 }, run: (u) => scanCommunitiesFor(u, { maxLookups: 25 }) },
  { id: "reddit_game", when: { daily: 12 }, run: (u) => runRedditDailyFor(u) },
  { id: "stripe", when: { daily: 6 }, run: (u) => syncStripeFor(u) },
  { id: "new_business", when: { daily: 7 }, needsOutreach: true, run: (u, c) => findNewBusinessesFor(u, c.lastRunAt) },
  { id: "site_checks", when: { daily: 8 }, needsOutreach: true, run: (u) => checkLeadSitesFor(u) },
  { id: "followups", when: { daily: 8 }, needsOutreach: true, run: (u, c) => queueFollowUpsFor(u, c.day) },
  { id: "demos", when: { every: 120, from: 6, to: 23 }, needsOutreach: true, run: (u) => ensureDemosFor(u) },
  { id: "client_uptime", when: { daily: 9 }, run: (u) => checkClientSitesFor(u) },
  { id: "client_reports", when: { monthly: 9 }, run: (u) => monthlyReportsReadyFor(u) },
  // Gig autopilot: replies first (speed wins), then applications, then follow-ups.
  { id: "autopilot_send", when: { every: 30, from: 9, to: 21 }, run: (u) => runAutopilotSendFor(u) },
  { id: "autopilot_followups", when: { daily: 10 }, run: (u) => runAutopilotFollowUpsFor(u) },
];

/** Pure: is this task due now? (tested) */
export function isDue(when: When, now: { day: string; minutes: number }, last: { day: string; at: Date } | null, nowMs: number): boolean {
  const hour = now.minutes / 60;
  if ("daily" in when) return hour >= when.daily && (!last || last.day < now.day);
  if ("monthly" in when) return now.day.endsWith("-01") && hour >= when.monthly && (!last || last.day.slice(0, 7) < now.day.slice(0, 7));
  return hour >= when.from && hour < when.to && (!last || nowMs - last.at.getTime() >= when.every * 60_000);
}

export async function runScheduledTasksFor(userId: number, budgetMs = 45_000) {
  const started = Date.now();
  const [s] = await db.select({ tz: outreachSettings.timezone, active: outreachSettings.active }).from(outreachSettings).where(eq(outreachSettings.userId, userId)).limit(1);
  const tz = s?.tz ?? "Europe/Sarajevo";
  const now = localNow(tz);
  const runs = await db.select().from(taskRuns).where(eq(taskRuns.userId, userId));
  const ran: { task: string; ok: boolean; result: string }[] = [];

  for (const task of TASKS) {
    if (Date.now() - started > budgetMs) break;
    if (task.needsOutreach && !s?.active) continue;
    const prev = runs.find((r) => r.task === task.id);
    const last = prev ? { day: localNow(tz, prev.lastRunAt).day, at: prev.lastRunAt } : null;
    if (!isDue(task.when, now, last, Date.now())) continue;
    let ok = true;
    let result: string;
    try {
      result = JSON.stringify((await task.run(userId, { day: now.day, lastRunAt: prev?.lastRunAt ?? null, outreachOn: !!s?.active })) ?? null).slice(0, 500);
    } catch (e) {
      ok = false;
      result = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    }
    // Record even failures, so a broken source isn't hammered every 10 minutes.
    await db.insert(taskRuns).values({ userId, task: task.id, lastRunAt: new Date(), lastResult: result })
      .onConflictDoUpdate({ target: [taskRuns.userId, taskRuns.task], set: { lastRunAt: new Date(), lastResult: result } });
    ran.push({ task: task.id, ok, result });
  }
  return { at: now.time, ran };
}

export async function taskStatusFor(userId: number) {
  return db.select({ task: taskRuns.task, lastRunAt: taskRuns.lastRunAt, lastResult: taskRuns.lastResult }).from(taskRuns)
    .where(and(eq(taskRuns.userId, userId)));
}
