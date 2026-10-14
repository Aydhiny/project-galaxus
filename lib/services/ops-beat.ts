// The heartbeat that keeps the crew moving. Everything time-based in Ops — retrying
// a failed mission, dispatching cloud agents, planning a project's day, reviews —
// runs on a beat. GitHub's scheduled workflow was meant to beat every 5 minutes,
// but GitHub only actually ran it every 3–5 hours, so the crew sat idle.
// Now there are two beats:
//   • the /ops page beats once a minute while you have it open;
//   • a private beat URL you give to a free cron service (cron-job.org, every 5 min)
//     beats 24/7. It can only trigger a beat; it reads and changes nothing else.
// Either way at most one beat per user per minute runs (claimed in the database).

import { randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsSettings } from "@/lib/db/schema";

const MIN_GAP_MS = 55_000;

/** Run one beat if none ran in the last minute. Returns what the tick did, or null if it was too soon. Never throws. */
export async function beatFor(userId: number, o: { full?: boolean } = {}) {
  const { opsSettingsFor } = await import("@/lib/services/ops-inbox");
  await opsSettingsFor(userId); // make sure the row exists
  const [won] = await db.update(opsSettings).set({ lastBeatAt: new Date() })
    .where(and(eq(opsSettings.userId, userId), or(isNull(opsSettings.lastBeatAt), lt(opsSettings.lastBeatAt, new Date(Date.now() - MIN_GAP_MS)))))
    .returning({ userId: opsSettings.userId });
  if (!won) return null;
  try {
    if (o.full) {
      // The 24/7 beat runs every automation that's due (the same as the runner's beat), Ops included.
      const { runScheduledTasksFor } = await import("@/lib/services/scheduler");
      return await runScheduledTasksFor(userId);
    }
    const { opsTickFor } = await import("@/lib/services/ops-day");
    return await opsTickFor(userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "beat failed" };
  }
}

/** Your private beat key (created on first use). Only good for triggering a beat. */
export async function beatKeyFor(userId: number, rotate = false) {
  const { opsSettingsFor } = await import("@/lib/services/ops-inbox");
  const s = await opsSettingsFor(userId);
  if (s.beatKey && !rotate) return s.beatKey;
  const key = randomBytes(18).toString("base64url");
  await db.update(opsSettings).set({ beatKey: key }).where(eq(opsSettings.userId, userId));
  return key;
}

/** The 24/7 beat: the user id and key from the URL must match. */
export async function beatByKey(userId: number, key: string) {
  if (!Number.isInteger(userId) || userId <= 0 || !key || key.length > 64) return { ok: false as const, status: 401 };
  const [s] = await db.select({ key: opsSettings.beatKey }).from(opsSettings).where(eq(opsSettings.userId, userId)).limit(1);
  const a = Buffer.from(String(s?.key ?? "")), b = Buffer.from(key);
  if (!s?.key || a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false as const, status: 401 };
  return { ok: true as const, result: await beatFor(userId, { full: true }) };
}

/** When the last beat ran (shown in Connectors so you can see the crew's pulse). */
export async function lastBeatFor(userId: number) {
  const [s] = await db.select({ at: opsSettings.lastBeatAt }).from(opsSettings).where(eq(opsSettings.userId, userId)).limit(1);
  return s?.at ?? null;
}
