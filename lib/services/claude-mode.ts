// Whose Claude runs a user's jobs — every account brings its own:
//   "runner" — they set up their own GitHub Actions runner (a voice-scope
//              Galaxus token + their own Claude subscription in their repo)
//   "api"    — they pasted their own Anthropic API key; jobs run server-side on it
//   "none"   — not connected: Claude features ask them to connect
//
// Nobody's jobs can run on someone else's subscription: the runner only ever
// claims jobs for the user who owns its token (lib/services/voice.ts).

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens, voiceCommands } from "@/lib/db/schema";
import { getSecret } from "@/lib/services/secrets";
import { askClaude } from "@/lib/services/claude";

export type ClaudeMode = "runner" | "api" | "none";

export async function claudeModeFor(userId: number): Promise<ClaudeMode> {
  const [runner] = await db.select({ id: apiTokens.id }).from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), eq(apiTokens.scope, "voice"), isNull(apiTokens.revokedAt))).limit(1);
  if (runner) return "runner";
  return (await getSecret(userId, "anthropic")) ? "api" : "none";
}

export const NOT_CONNECTED = "Connect your own Claude first — Connections → Claude (paste your Anthropic API key).";

/**
 * Run one queued job on the user's own Anthropic key: claim it (only if still
 * queued), build the prompt from fresh data, ask Claude, apply the answer.
 */
export async function runJobViaApi(userId: number, id: number) {
  const { buildJobPrompt } = await import("@/lib/services/claude-jobs");
  const { completeFor } = await import("@/lib/services/voice");
  const [job] = await db.update(voiceCommands).set({ status: "running", startedAt: new Date(), attempts: 1 })
    .where(and(eq(voiceCommands.id, id), eq(voiceCommands.userId, userId), eq(voiceCommands.status, "queued"))).returning();
  if (!job) return;
  const apiKey = await getSecret(userId, "anthropic");
  try {
    if (!apiKey) throw new Error(NOT_CONNECTED);
    const { system, prompt } = await buildJobPrompt(job);
    const text = await askClaude({ apiKey, system, prompt, effort: "medium", maxTokens: 6000 });
    await completeFor(userId, id, text ? { ok: true, summary: text } : { ok: false, error: "Claude declined this one." });
  } catch (e) {
    await completeFor(userId, id, { ok: false, error: e instanceof Error ? e.message : "Claude call failed." });
  }
}
