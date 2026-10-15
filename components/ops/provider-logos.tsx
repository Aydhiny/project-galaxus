// Provider logos for the facility. Claude, Cursor, Copilot, Gemini, Windsurf, OpenCode and
// Cline come from Simple Icons (CC0) and are used only to say "this agent runs on X".
// Simple Icons has no OpenAI or xAI mark, so Codex, Grok and "other" get neutral glyphs drawn here.
// Same path data feeds the 2D icon and the 3D badge texture.

import { siClaude, siCline, siCursor, siGithubcopilot, siGooglegemini, siHuggingface, siMistralai, siNvidia, siOpencode, siOpenrouter, siWindsurf } from "simple-icons";
import { cn } from "@/lib/utils";
import { PROVIDERS, type ProviderKey } from "@/lib/ops";
import { RUN_ENGINE_LABEL, runEngineOf, type BadgeKey, type RunEngine } from "@/lib/ops-run-engine";

type Logo = { path: string; hex: string; mono?: boolean; evenodd?: boolean };

export const PROVIDER_LOGO: Record<ProviderKey, Logo> = {
  claude: { path: siClaude.path, hex: siClaude.hex },
  codex: { path: "M4.5 5.5 3 7l5 5-5 5 1.5 1.5L11 12 4.5 5.5ZM12 16.5h9V19h-9v-2.5Z", hex: "10A37F" }, // a prompt: › _
  cursor: { path: siCursor.path, hex: siCursor.hex, mono: true },
  copilot: { path: siGithubcopilot.path, hex: siGithubcopilot.hex, mono: true },
  gemini: { path: siGooglegemini.path, hex: siGooglegemini.hex },
  windsurf: { path: siWindsurf.path, hex: siWindsurf.hex, mono: true },
  grok: { path: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Zm0 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14ZM8.6 7.2l8.2 8.2-1.4 1.4-8.2-8.2Z", hex: "9CA3AF", mono: true, evenodd: true }, // a slashed ring
  opencode: { path: siOpencode.path, hex: siOpencode.hex, mono: true },
  cline: { path: siCline.path, hex: siCline.hex, mono: true },
  other: { path: "M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM6 14a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm12 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z", hex: "9CA3AF" }, // three linked nodes
};

/** Monochrome marks need a light colour on the facility's dark background. */
export const isMonoLogo = (p: ProviderKey) => !!PROVIDER_LOGO[p].mono;

// What a cloud agent actually runs on (lib/ops-run-engine.ts). Simple Icons where it has the brand
// (Mistral, OpenRouter, NVIDIA, Hugging Face, Gemini); Groq and Cerebras aren't in it, so they get a
// simple glyph in their brand colour. Gateways and custom endpoints get a generic chip, the finder a compass.
const CHIP = "M7 7h10v10H7ZM9.5 9.5v5h5v-5ZM9 3h1.5v3H9Zm4.5 0H15v3h-1.5ZM9 18h1.5v3H9Zm4.5 0H15v3h-1.5ZM3 9h3v1.5H3Zm0 4.5h3V15H3ZM18 9h3v1.5h-3Zm0 4.5h3V15h-3Z";
export const ENGINE_LOGO: Record<RunEngine | "auto" | "free", Logo> = {
  claude: PROVIDER_LOGO.claude,
  gemini: PROVIDER_LOGO.gemini,
  groq: { path: "M12 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12ZM12 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7ZM15.5 10H18v6a5 5 0 0 1-5 5H8v-2.5h5a2.5 2.5 0 0 0 2.5-2.5Z", hex: "F55036" }, // a "g"
  cerebras: { path: "M18.36 5.64A9 9 0 1 0 18.36 18.36L15.89 15.89A5.5 5.5 0 1 1 15.89 8.11ZM12 10a2 2 0 1 1 0 4a2 2 0 1 1 0-4Z", hex: "F15A29" }, // a "C" around a core
  mistral: { path: siMistralai.path, hex: siMistralai.hex },
  openrouter: { path: siOpenrouter.path, hex: "6467F2" }, // its listed grey vanishes on the badge
  nvidia: { path: siNvidia.path, hex: siNvidia.hex },
  huggingface: { path: siHuggingface.path, hex: "F59E0B" }, // a deeper yellow, so the white mark reads
  llm7: { path: CHIP, hex: "64748B", evenodd: true },
  omniroute: { path: CHIP, hex: "64748B", evenodd: true },
  custom: { path: CHIP, hex: "64748B", evenodd: true },
  free: { path: CHIP, hex: "10B981", evenodd: true }, // set to free models, nothing ran yet
  finder: { path: "M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20ZM12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15ZM16 8l-2.5 5.5L8 16l2.5-5.5Z", hex: "16A34A" }, // a compass
  auto: { path: "M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.7 8.1A5 5 0 0 1 17 18H7Z", hex: "64748B" }, // a neutral cloud: Claude or free, decided per mission
};

/** The logo for any badge: an engine's, else a client's. */
export function logoFor(key: BadgeKey): Logo {
  return (ENGINE_LOGO as Record<string, Logo>)[key] ?? PROVIDER_LOGO[key as ProviderKey] ?? PROVIDER_LOGO.other;
}

/** Tooltip / screen-reader name for a badge. */
export function badgeName(key: BadgeKey) {
  if (key === "auto") return "Auto: Claude, or free models when Claude runs out";
  if (key === "free") return "Free models";
  return runEngineOf(key) ? RUN_ENGINE_LABEL[key as RunEngine] : PROVIDERS[key as ProviderKey]?.label ?? "Agent";
}

/** The 2D twin of the 3D badge: what this agent runs on. */
export function BadgeIcon({ badge, className }: { badge: BadgeKey; className?: string }) {
  const l = logoFor(badge);
  return (
    <svg role="img" aria-label={badgeName(badge)} viewBox="0 0 24 24" className={cn("w-4 h-4 shrink-0", l.mono && "text-white", className)} fill={l.mono ? "currentColor" : `#${l.hex}`}>
      <title>{badgeName(badge)}</title>
      <path d={l.path} fillRule={l.evenodd ? "evenodd" : undefined} />
    </svg>
  );
}

export function ProviderIcon({ provider, className }: { provider: ProviderKey; className?: string }) {
  const l = PROVIDER_LOGO[provider] ?? PROVIDER_LOGO.other;
  return (
    <svg role="img" aria-label={PROVIDERS[provider]?.label ?? "Agent"} viewBox="0 0 24 24" className={cn("w-4 h-4 shrink-0", l.mono && "text-white", className)} fill={l.mono ? "currentColor" : `#${l.hex}`}>
      <path d={l.path} fillRule={l.evenodd ? "evenodd" : undefined} />
    </svg>
  );
}
