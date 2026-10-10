// Brand logos for connectors (Simple Icons, CC0 — https://simpleicons.org).
// Logos are used only to say "this connects to X", which is what brand
// guidelines allow. Near-black logos (GitHub, Anthropic) use currentColor so
// they stay visible in dark mode.

import { siAnthropic, siClaude, siGithub, siGooglecalendar, siGooglemaps, siOpenstreetmap, siWhatsapp, siYoutube } from "simple-icons";
import { cn } from "@/lib/utils";

const ICONS = {
  claude: siClaude,
  anthropic: siAnthropic,
  github: siGithub,
  googlecalendar: siGooglecalendar,
  googlemaps: siGooglemaps,
  openstreetmap: siOpenstreetmap,
  whatsapp: siWhatsapp,
  youtube: siYoutube,
} as const;

export type Brand = keyof typeof ICONS;
const MONO = new Set<Brand>(["github", "anthropic"]);

export function BrandIcon({ name, className, mono, color }: { name: Brand; className?: string; mono?: boolean; color?: string }) {
  const icon = ICONS[name];
  const fill = color ?? (mono || MONO.has(name) ? "currentColor" : `#${icon.hex}`);
  return (
    <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" className={cn("w-4 h-4 shrink-0", className)} fill={fill}>
      <path d={icon.path} />
    </svg>
  );
}

/** Logo on a soft rounded tile — for connector cards and setup headers. */
export function BrandTile({ name, className }: { name: Brand; className?: string }) {
  const hex = ICONS[name].hex;
  return (
    <span
      className={cn("inline-flex items-center justify-center w-10 h-10 rounded-xl border border-border shrink-0", className)}
      style={MONO.has(name) ? undefined : { backgroundColor: `#${hex}14` }}
    >
      <BrandIcon name={name} className="w-5 h-5" />
    </span>
  );
}
