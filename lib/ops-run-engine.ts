// What a cloud agent is ACTUALLY running on. A cloud agent's `provider` is
// always "claude" (it's hired into Galaxus cloud), but its runs can go to
// Claude, to one of the free providers (Groq, Gemini…) or to the business
// finder (no model at all). Each run records its engine and model on the agent
// (ops_agents.run_engine / run_model) and the mission (ops_missions.ran_on), so
// the badge, the monitor, the feed and the cards say what really did the work.
// Pure, tested in ops-run-engine.test.ts.

import type { ProviderKey } from "@/lib/ops";

export const RUN_ENGINES = ["claude", "groq", "gemini", "openrouter", "mistral", "cerebras", "nvidia", "llm7", "huggingface", "omniroute", "custom", "finder"] as const;
export type RunEngine = (typeof RUN_ENGINES)[number];
export const runEngineOf = (s: string | null | undefined): RunEngine | null => ((RUN_ENGINES as readonly string[]).includes(s ?? "") ? (s as RunEngine) : null);

export const RUN_ENGINE_LABEL: Record<RunEngine, string> = {
  claude: "Claude", groq: "Groq", gemini: "Gemini", openrouter: "OpenRouter", mistral: "Mistral", cerebras: "Cerebras", nvidia: "NVIDIA",
  llm7: "LLM7", huggingface: "Hugging Face", omniroute: "OmniRoute", custom: "Custom model", finder: "Map finder",
};

/** "on Gemini · gemini-3.8-flash", "on Claude · sonnet", "on the map finder" — null when nothing ran yet. */
export function runLabel(engine: string | null | undefined, model?: string | null) {
  const e = runEngineOf(engine);
  if (!e) return null;
  if (e === "finder") return "on the map finder";
  return `on ${RUN_ENGINE_LABEL[e]}${model ? ` · ${model}` : ""}`;
}

/** Just the engine's name, for tight spots (the status tag). */
export const runShort = (engine: string | null | undefined) => { const e = runEngineOf(engine); return e ? RUN_ENGINE_LABEL[e] : null; };

/** ops_missions.ran_on stores "engine:model" (model ids may contain ":" too, e.g. ":free", so split on the first). */
export const packRanOn = (engine: RunEngine, model: string | null) => `${engine}:${model ?? ""}`.slice(0, 140);
export function parseRanOn(s: string | null | undefined): { engine: RunEngine; model: string | null } | null {
  if (!s) return null;
  const i = s.indexOf(":");
  const engine = runEngineOf(i < 0 ? s : s.slice(0, i));
  if (!engine) return null;
  const model = i < 0 ? "" : s.slice(i + 1);
  return { engine, model: model || null };
}

/** Every logo the facility can show over an agent: a client's, an engine's, or the setting before any run. */
export type BadgeKey = ProviderKey | RunEngine | "auto" | "free";

/**
 * The badge over an agent's head. Agents on your computer show their client.
 * A cloud agent shows what its last run ran on; before any run, its engine
 * setting: Claude only when set to Claude, a free-models chip, or a neutral cloud for auto.
 */
export function badgeFor(a: { cloud: boolean; provider: ProviderKey; engine?: string | null; runEngine?: string | null }): BadgeKey {
  if (!a.cloud) return a.provider;
  const ran = runEngineOf(a.runEngine);
  if (ran) return ran;
  return a.engine === "claude" ? "claude" : a.engine === "free" ? "free" : "auto";
}
