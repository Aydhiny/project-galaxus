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
  /** Let Claude search and read the web (Anthropic's server-side tools). Used by Ops cloud agents. */
  web?: boolean;
}): Promise<string | null> {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: opts.web ? 300_000 : 120_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const tools: Anthropic.Beta.BetaToolUnion[] | undefined = opts.web
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 }]
    : undefined;

  // Server tools can pause a long turn ("pause_turn"); send it back as-is to let Claude carry on.
  for (let round = 0; round < 4; round++) {
    const response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens,
      // A policy decline is retried on Anthropic's recommended fallback model
      // inside the same call, instead of coming back as a refusal.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort },
      system: opts.system,
      messages,
      ...(tools ? { tools } : {}),
    });
    if (response.stop_reason === "refusal") return null;
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    return text || null;
  }
  return null;
}
