// Voice commands — queue, dispatch, claim, record, complete.
//
// Security model (the short version):
//  • Your Claude subscription token lives ONLY in GitHub Actions secrets
//    (CLAUDE_CODE_OAUTH_TOKEN). Galaxus never sees it, stores it, or sends it.
//  • The runner authenticates to Galaxus with a scope="voice" API token that
//    can only claim/complete voice jobs and use non-destructive MCP tools.
//  • Transcripts travel Galaxus → runner over HTTPS at claim time. They are
//    never passed as workflow inputs (public in a public repo) or printed.
//  • Galaxus triggers the workflow with a fine-grained GitHub token limited to
//    "Actions: read & write" on this one repo, stored encrypted per user.

import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceCommands, type VoiceCommand } from "@/lib/db/schema";
import { MAX_TRANSCRIPT, STALE_RUNNING_MS, VOICE_RATE, VOICE_SYSTEM, buildVoicePrompt, describeToolResult } from "@/lib/voice";
import { checkRateLimit } from "@/lib/ratelimit";
import { getSecret, setSecret } from "@/lib/services/secrets";
import { notifyUser } from "@/lib/services/outreach/push";
import { buildJobPrompt, applyJobResult } from "@/lib/services/claude-jobs";
import { JOB_LABEL, type JobKind } from "@/lib/claude-jobs";

export const VOICE_REPO = process.env.GALAXUS_VOICE_REPO ?? "Aydhiny/project-galaxus";
export const VOICE_WORKFLOW = "voice.yml";

// ─── Submitting ───────────────────────────────────────────────────────────────

export async function createCommandFor(
  userId: number,
  input: { transcript: string; localDate: string; localTime: string; timezone: string }
) {
  const transcript = String(input.transcript ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT);
  if (transcript.length < 3) throw new Error("Say a bit more — nothing to send yet.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate) || !/^\d{2}:\d{2}$/.test(input.localTime)) throw new Error("Bad date.");
  // Protects your Claude plan's limits if a session were ever hijacked.
  if (!checkRateLimit(`voice:${userId}`, VOICE_RATE.max, VOICE_RATE.windowMs).allowed) {
    throw new Error("That's a lot of voice commands for one hour — try again a bit later.");
  }
  const [row] = await db
    .insert(voiceCommands)
    .values({ userId, transcript, localDate: input.localDate, localTime: input.localTime, timezone: String(input.timezone).slice(0, 50) || "UTC" })
    .returning();
  const dispatched = await dispatchRunner(userId);
  return { row, dispatched };
}

/**
 * Start the GitHub Actions runner now. Without a GitHub key the scheduled
 * fallback (every 10 minutes) still picks the command up — just slower.
 */
export async function dispatchRunner(userId: number): Promise<boolean> {
  const token = await getSecret(userId, "github");
  if (!token) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${VOICE_REPO}/actions/workflows/${VOICE_WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Galaxus",
      },
      // No inputs on purpose: in a public repo, workflow inputs are public.
      body: JSON.stringify({ ref: "master" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[voice] dispatch failed:", res.status);
    return res.ok;
  } catch (e) {
    console.error("[voice] dispatch error:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function retryCommandFor(userId: number, id: number) {
  const [row] = await db
    .update(voiceCommands)
    .set({ status: "queued", error: null, startedAt: null, finishedAt: null })
    .where(and(eq(voiceCommands.id, id), eq(voiceCommands.userId, userId), eq(voiceCommands.status, "failed")))
    .returning();
  if (!row) throw new Error("Only failed commands can be retried.");
  return { row, dispatched: await dispatchRunner(userId) };
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export async function listCommandsFor(userId: number, limit = 20) {
  return db
    .select()
    .from(voiceCommands)
    .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.kind, "voice")))
    .orderBy(desc(voiceCommands.id))
    .limit(limit);
}

export async function getCommandFor(userId: number, id: number) {
  const [row] = await db.select().from(voiceCommands).where(and(eq(voiceCommands.id, id), eq(voiceCommands.userId, userId))).limit(1);
  return row ?? null;
}

export async function voiceSetupFor(userId: number) {
  return { hasGithubKey: !!(await getSecret(userId, "github")), repo: VOICE_REPO };
}

export async function saveGithubKeyFor(userId: number, key: string) {
  const v = key.trim();
  if (v && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v)) throw new Error("That doesn't look like a GitHub token.");
  await setSecret(userId, "github", v || null);
}

// ─── Runner side (scope="voice" token) ────────────────────────────────────────

/** Jobs stuck in "running" (crashed runner) go back to the queue, at most twice. */
async function reapStale(userId: number) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  await db
    .update(voiceCommands)
    .set({ status: sql`case when ${voiceCommands.attempts} >= 2 then 'failed' else 'queued' end`, error: sql`case when ${voiceCommands.attempts} >= 2 then 'Timed out' else null end` })
    .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.status, "running"), lt(voiceCommands.startedAt, cutoff)));
}

export async function queuedCountFor(userId: number) {
  await reapStale(userId);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(voiceCommands)
    .where(and(eq(voiceCommands.userId, userId), eq(voiceCommands.status, "queued")));
  return n;
}

/** Atomically take the oldest queued command (safe if two runners overlap). */
export async function claimNextFor(userId: number) {
  await reapStale(userId);
  const rows = await db.execute(sql`
    update ${voiceCommands}
    set status = 'running', started_at = now(), attempts = attempts + 1, actions = '[]'::jsonb
    where id = (
      select id from ${voiceCommands}
      where user_id = ${userId} and status = 'queued'
      order by id
      limit 1
      for update skip locked
    )
    returning id, transcript, local_date, local_time, timezone, kind, payload
  `);
  const row = (rows as unknown as { rows: Record<string, unknown>[] }).rows?.[0];
  if (!row) return null;
  if (row.kind !== "voice") {
    // Other Claude jobs (devlog, hooks, replies, playtest) build their prompt
    // from fresh data. A job whose data vanished fails cleanly.
    try {
      const built = await buildJobPrompt({ userId, kind: String(row.kind), payload: row.payload as Record<string, unknown> });
      return { id: Number(row.id), ...built };
    } catch (e) {
      await completeFor(userId, Number(row.id), { ok: false, error: e instanceof Error ? e.message : "Couldn't prepare this job." });
      return claimNextFor(userId);
    }
  }
  return {
    id: Number(row.id),
    system: VOICE_SYSTEM,
    prompt: buildVoicePrompt({
      transcript: String(row.transcript),
      localDate: String(row.local_date),
      localTime: String(row.local_time),
      timezone: String(row.timezone),
    }),
  };
}

/** Called by the MCP route after each successful tool call from a voice token. */
export async function recordToolResultFor(userId: number, tool: string, resultText: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    return;
  }
  const actions = describeToolResult(tool, parsed);
  if (actions.length === 0) return;
  // Append to whichever command this user's runner is working on right now.
  await db.execute(sql`
    update ${voiceCommands}
    set actions = actions || ${JSON.stringify(actions)}::jsonb
    where id = (select id from ${voiceCommands} where user_id = ${userId} and status = 'running' order by started_at desc limit 1)
  `);
}

export async function completeFor(userId: number, id: number, result: { ok: boolean; summary?: string; error?: string }) {
  const [current] = await db
    .select()
    .from(voiceCommands)
    .where(and(eq(voiceCommands.id, id), eq(voiceCommands.userId, userId), eq(voiceCommands.status, "running")))
    .limit(1);
  if (!current) return null;

  const full = result.summary ? String(result.summary).slice(0, 20_000) : null;
  let ok = result.ok;
  let summary = full ? full.slice(0, 2000) : null;
  let error = ok ? null : String(result.error ?? "Claude couldn't finish this one.").slice(0, 500);
  // Non-voice jobs: turn Claude's answer into data (idea, hooks, replies, themes).
  if (ok && current.kind !== "voice") {
    try {
      summary = await applyJobResult(current, full ?? "");
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : "Couldn't use Claude's answer.";
    }
  }
  const [row] = await db
    .update(voiceCommands)
    .set({ status: ok ? "done" : "failed", summary, result: full, error, finishedAt: new Date() })
    .where(eq(voiceCommands.id, id))
    .returning();
  await notifyDone(userId, row);
  return row;
}

const JOB_URL: Record<string, string> = { voice: "/voice", devlog: "/youtube", hooks: "/youtube", comment_replies: "/youtube", playtest: "/game" };

async function notifyDone(userId: number, c: VoiceCommand) {
  const n = c.actions.length;
  const label = JOB_LABEL[c.kind as JobKind] ?? "Claude job";
  await notifyUser(userId, {
    title: c.status === "done"
      ? c.kind === "voice" ? (n ? `Claude made ${n} change${n === 1 ? "" : "s"}` : "Claude finished") : `${label} ready`
      : `${label} failed`,
    body: c.status === "done" ? (c.summary ?? "Open Galaxus to see what changed.").slice(0, 140) : (c.error ?? "Tap to retry."),
    url: JOB_URL[c.kind] ?? "/voice",
    tag: `voice-${c.id}`,
  }).catch(() => {});
}
