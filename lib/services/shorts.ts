// Shorts studio: voice recording in → short-form videos out, made on YOUR PC.
//
// Galaxus only queues the job and shows the result. A small worker on your
// computer (scripts/shorts-worker.mjs, scope="shorts" token) claims the job,
// downloads the audio and runs Claude Code inside your video pipeline folder,
// where the game footage and render scripts live. The audio is deleted here as
// soon as the job finishes.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { shortJobs, taskRuns } from "@/lib/db/schema";
import { createApiTokenFor } from "@/lib/services/api-tokens";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const AUDIO = /^audio\/|^video\/(mp4|webm|quicktime)$/;

/** Uploads arrive in 3 MB chunks (Vercel caps a request at 4.5 MB). 3 MB is a multiple of 3 bytes, so base64 pieces join cleanly. */
export const CHUNK_BYTES = 3 * 1024 * 1024;

export async function appendShortChunkFor(userId: number, id: number, bytes: Buffer, final: boolean) {
  const [j] = await db.select({ status: shortJobs.status, size: shortJobs.audioBytes }).from(shortJobs).where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId))).limit(1);
  if (!j || j.status !== "uploading") throw new Error("That upload isn't open anymore.");
  if ((j.size ?? 0) + bytes.length > MAX_AUDIO_BYTES) throw new Error("That recording is over 20 MB — trim it or export at a lower bitrate.");
  await db.update(shortJobs).set({
    audioData: sql`coalesce(${shortJobs.audioData}, '') || ${bytes.toString("base64")}`,
    audioBytes: sql`coalesce(${shortJobs.audioBytes}, 0) + ${bytes.length}`,
    ...(final ? { status: "queued" } : {}),
  }).where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId)));
}

export async function createShortJobFor(userId: number, input: { name: string; mime: string; bytes: Buffer; notes?: string | null; count?: number; final?: boolean }) {
  if (!AUDIO.test(input.mime)) throw new Error("Upload an audio file (mp3, wav, m4a, ogg…).");
  if (input.bytes.length > MAX_AUDIO_BYTES) throw new Error("That recording is over 20 MB — trim it or export at a lower bitrate.");
  const open = await db.select({ n: sql<number>`count(*)::int` }).from(shortJobs).where(and(eq(shortJobs.userId, userId), inArray(shortJobs.status, ["queued", "working", "uploading"])));
  if ((open[0]?.n ?? 0) >= 5) throw new Error("5 recordings are already waiting — let the worker catch up first.");
  const [row] = await db.insert(shortJobs).values({
    userId, notes: input.notes?.slice(0, 2000) || null, count: Math.max(0, Math.min(3, Math.round(input.count ?? 0))),
    audioName: input.name.slice(0, 200), audioMime: input.mime.slice(0, 60), audioData: input.bytes.toString("base64"), audioBytes: input.bytes.length,
    status: input.final === false ? "uploading" : "queued",
  }).returning({ id: shortJobs.id });
  return row;
}

export async function shortJobsFor(userId: number) {
  const [jobs, beat] = await Promise.all([
    db.select({
      id: shortJobs.id, status: shortJobs.status, notes: shortJobs.notes, count: shortJobs.count, audioName: shortJobs.audioName, audioBytes: shortJobs.audioBytes,
      results: shortJobs.results, log: shortJobs.log, createdAt: shortJobs.createdAt, claimedAt: shortJobs.claimedAt, finishedAt: shortJobs.finishedAt,
    }).from(shortJobs).where(eq(shortJobs.userId, userId)).orderBy(desc(shortJobs.createdAt)).limit(20),
    db.select({ at: taskRuns.lastRunAt }).from(taskRuns).where(and(eq(taskRuns.userId, userId), eq(taskRuns.task, "shorts_worker"))).limit(1),
  ]);
  return { jobs, workerSeenAt: beat[0]?.at?.toISOString() ?? null };
}

/** A token that can ONLY claim/complete shorts jobs (no tasks, no MCP, no outreach). */
export async function createShortsWorkerTokenFor(userId: number) {
  return (await createApiTokenFor(userId, "Shorts worker (this PC)", "shorts")).token;
}

export async function retryShortJobFor(userId: number, id: number) {
  const [j] = await db.select({ data: shortJobs.audioData }).from(shortJobs).where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId))).limit(1);
  if (!j) throw new Error("Not found.");
  if (!j.data) throw new Error("The recording was already cleaned up — upload it again.");
  await db.update(shortJobs).set({ status: "queued", log: null, claimedAt: null, finishedAt: null }).where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId)));
}

export async function deleteShortJobFor(userId: number, id: number) {
  await db.delete(shortJobs).where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId)));
}

// ─── Worker side ─────────────────────────────────────────────────────────────

/** Heartbeat + claim the oldest queued job. A job stuck "working" for 4 h is handed out again. */
export async function claimShortJobFor(userId: number) {
  await db.insert(taskRuns).values({ userId, task: "shorts_worker", lastRunAt: new Date(), lastResult: "poll" })
    .onConflictDoUpdate({ target: [taskRuns.userId, taskRuns.task], set: { lastRunAt: new Date() } });
  const r = await db.execute(sql`
    update ${shortJobs} set status = 'working', claimed_at = now()
    where id = (select id from ${shortJobs} where user_id = ${userId}
                and (status = 'queued' or (status = 'working' and claimed_at < now() - interval '4 hours'))
                order by created_at limit 1 for update skip locked)
    returning id, notes, count, audio_name, audio_mime`);
  const row = (r as unknown as { rows: { id: number; notes: string | null; count: number; audio_name: string | null; audio_mime: string | null }[] }).rows?.[0];
  return row ? { id: row.id, notes: row.notes, count: row.count, audioName: row.audio_name, audioMime: row.audio_mime } : null;
}

export async function shortAudioFor(userId: number, id: number) {
  const [j] = await db.select({ data: shortJobs.audioData, mime: shortJobs.audioMime, name: shortJobs.audioName }).from(shortJobs)
    .where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId))).limit(1);
  if (!j?.data) return null;
  return { bytes: Buffer.from(j.data, "base64"), mime: j.mime ?? "application/octet-stream", name: j.name ?? `voice-${id}` };
}

type Result = { title: string; file: string; seconds: number | null; hook?: string | null; thumb?: string | null };
export async function completeShortJobFor(userId: number, id: number, input: { ok: boolean; results?: Result[]; log?: string }) {
  const results = (input.results ?? []).slice(0, 5).map((r) => ({
    title: String(r.title ?? "").slice(0, 160), file: String(r.file ?? "").slice(0, 400), seconds: Number(r.seconds) || null,
    hook: r.hook ? String(r.hook).slice(0, 200) : null,
    thumb: typeof r.thumb === "string" && r.thumb.startsWith("data:image/jpeg;base64,") && r.thumb.length < 200_000 ? r.thumb : null,
  }));
  await db.update(shortJobs).set({
    status: input.ok && results.length ? "done" : "failed", results, log: input.log?.slice(-4000) ?? null, finishedAt: new Date(),
    ...(input.ok && results.length ? { audioData: null } : {}), // keep the audio on failure so you can retry
  }).where(and(eq(shortJobs.id, id), eq(shortJobs.userId, userId)));
}
