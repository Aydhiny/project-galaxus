// Provider logos for the facility. Claude, Cursor, Copilot, Gemini, Windsurf, OpenCode and
// Cline come from Simple Icons (CC0) and are used only to say "this agent runs on X".
// Simple Icons has no OpenAI or xAI mark, so Codex, Grok and "other" get neutral glyphs drawn here.
// Same path data feeds the 2D icon and the 3D badge texture.

import { siClaude, siCline, siCursor, siGithubcopilot, siGooglegemini, siOpencode, siWindsurf } from "simple-icons";
import { cn } from "@/lib/utils";
import { PROVIDERS, type ProviderKey } from "@/lib/ops";

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

export function ProviderIcon({ provider, className }: { provider: ProviderKey; className?: string }) {
  const l = PROVIDER_LOGO[provider] ?? PROVIDER_LOGO.other;
  return (
    <svg role="img" aria-label={PROVIDERS[provider]?.label ?? "Agent"} viewBox="0 0 24 24" className={cn("w-4 h-4 shrink-0", l.mono && "text-white", className)} fill={l.mono ? "currentColor" : `#${l.hex}`}>
      <path d={l.path} fillRule={l.evenodd ? "evenodd" : undefined} />
    </svg>
  );
}
