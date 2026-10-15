// "ran on Groq · gpt-oss-120b" on a mission card: what really did the work
// (ops_missions.ran_on, lib/ops-run-engine.ts), with the engine's logo.

import { BadgeIcon } from "@/components/ops/provider-logos";
import { parseRanOn, runLabel } from "@/lib/ops-run-engine";

export function RanOn({ ranOn, running }: { ranOn: string | null | undefined; running?: boolean }) {
  const r = parseRanOn(ranOn);
  if (!r) return null;
  const label = runLabel(r.engine, r.model);
  return (
    <span className="inline-flex items-center gap-1 text-white/60 min-w-0" title={`${running ? "Running" : "Ran"} ${label}`}>
      <BadgeIcon badge={r.engine} className="w-3 h-3" />
      <span className="truncate">{running ? "running" : "ran"} {label}</span>
    </span>
  );
}
