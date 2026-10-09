// One Claude call shape for the whole app (outreach messages, YouTube
// reports, scripts). Uses the user's own Anthropic key.

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-opus-5-5";

/** Text of a response, or null if Claude (and its fallback) declined. */
export async function askClaude(opts: {
  apiKey: string;
  system: string;
  prompt: string;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<string | null> {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 120_000 });
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens,
    // A policy decline is retried on Anthropic's recommended fallback model
    // inside the same call, instead of coming back as a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  return text || null;
}
