// Which model does the YouTube long-form work: Claude on your own Anthropic
// key when you have one, otherwise (or when Claude fails — no credit, key
// revoked) your free models from Ops → Free models, in your priority order.
// Every answer says who wrote it, so a weaker free-model script is never
// mistaken for a Claude one.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeLlmKeys } from "@/lib/db/schema";
import { tryDecrypt } from "@/lib/crypto-box";
import { getSecret } from "@/lib/services/secrets";
import { askClaude } from "@/lib/services/claude";
import { askFree, freeStatusFor } from "@/lib/services/free-llm";

import type { BrainPref } from "@/lib/youtube-longform";
export type { BrainPref };

const CLAUDE_LABEL: Record<string, string> = { "claude-opus-5-5": "Claude Opus 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5" };

export async function brainStatusFor(userId: number) {
  const [anthropic, free, groq] = await Promise.all([getSecret(userId, "anthropic"), freeStatusFor(userId), groqKeyFor(userId)]);
  return { claude: !!anthropic, freeModels: free.usableCount, whisper: !!groq };
}

export async function askBrain(userId: number, o: {
  system: string; prompt: string; maxTokens: number; prefer?: BrainPref;
  /** Opus for writing, Sonnet for reading long transcripts (cheaper per input token). */
  claudeModel?: "claude-opus-5-5" | "claude-sonnet-5-5";
}): Promise<{ text: string; by: string }> {
  const problems: string[] = [];
  if (o.prefer !== "free") {
    const apiKey = await getSecret(userId, "anthropic");
    if (apiKey) {
      const model = o.claudeModel ?? "claude-opus-5-5";
      try {
        const text = await askClaude({ apiKey, system: o.system, prompt: o.prompt, effort: "medium", maxTokens: o.maxTokens, model });
        if (text) return { text, by: CLAUDE_LABEL[model] ?? model };
        problems.push("Claude declined");
      } catch (e) {
        problems.push(`Claude: ${e instanceof Error ? e.message.slice(0, 160) : "failed"}`);
      }
    }
  }
  try {
    // Free models cap output lower; a long script still fits in 12k.
    const r = await askFree(userId, { system: o.system, prompt: o.prompt, maxTokens: Math.min(o.maxTokens, 12_000), json: true });
    return { text: r.text, by: `${r.name} · ${r.model}` };
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "Free models failed");
  }
  throw new Error(`No model could do this. ${problems.join(" · ")} — add an Anthropic key in YouTube → Setup, or a free key (Groq/Gemini, no card) in Ops → Free models.`);
}

/** Groq's free Whisper uses the same key as the Groq chat models in Ops → Free models. */
export async function groqKeyFor(userId: number) {
  const [row] = await db.select({ keyEnc: freeLlmKeys.keyEnc }).from(freeLlmKeys)
    .where(and(eq(freeLlmKeys.userId, userId), eq(freeLlmKeys.provider, "groq"))).limit(1);
  return tryDecrypt(row?.keyEnc) || null;
}
