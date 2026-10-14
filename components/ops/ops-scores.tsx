"use client";

// Scoreboard: how each agent (and each provider) actually performs over the
// last 30 days — accepted work, how often you send it back, what an accepted
// result costs, how long it takes, head-to-head wins. Levels grow with XP.

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDERS, ROLES, formatUsd, providerOf, roleOf, type ProviderKey, type Score } from "@/lib/ops";
import { ProviderIcon } from "@/components/ops/provider-logos";
import { Dialog } from "@/components/ops/ops-dialog";
import type { OpsOverview } from "@/lib/client/ops";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const mins = (v: number | null) => (v == null ? "—" : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h ${v % 60}m`);

export function Scoreboard({ data, onClose }: { data: OpsOverview; onClose: () => void }) {
  const rows = data.agents.map((a) => ({ a, s: data.scores[a.id] as Score })).filter((r) => r.s).sort((x, y) => y.s.xp - x.s.xp);
  // Provider rollup: totals across its agents (cloud agents count as "Galaxus cloud").
  const groups = new Map<string, { label: string; provider: ProviderKey; agents: number; delivered: number; accepted: number; sentBack: number; cost: number; minutes: number; timed: number; wins: number }>();
  for (const { a, s } of rows) {
    const key = a.cloud ? "cloud" : a.provider;
    const g = groups.get(key) ?? { label: a.cloud ? "Galaxus cloud" : PROVIDERS[providerOf(a.provider)].label, provider: providerOf(a.provider), agents: 0, delivered: 0, accepted: 0, sentBack: 0, cost: 0, minutes: 0, timed: 0, wins: 0 };
    g.agents++; g.delivered += s.delivered; g.accepted += s.accepted; g.sentBack += s.sentBack; g.wins += s.wins;
    g.cost += (s.costPerAcceptedCents ?? 0) * s.accepted;
    if (s.avgMinutes != null) { g.minutes += s.avgMinutes * s.delivered; g.timed += s.delivered; }
    groups.set(key, g);
  }
  const providers = [...groups.values()].filter((g) => g.delivered > 0).sort((x, y) => y.accepted - x.accepted);

  return (
    <Dialog title={<span className="inline-flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-300" /> Scoreboard</span>} sub="The last 30 days. XP: accepted +10, head-to-head win +15, delivered +2, sent back −3." onClose={onClose} wide>
      {rows.every((r) => r.s.delivered === 0) ? (
        <p className="text-sm text-white/55 py-6 text-center">No delivered work yet. Scores appear as agents submit results and you accept or send them back.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-white/45 text-left">
                <tr><th className="py-1.5 pr-2 font-medium">Agent</th><th className="px-2 font-medium">Level</th><th className="px-2 font-medium">Delivered</th><th className="px-2 font-medium">Accepted</th><th className="px-2 font-medium">Cost / accepted</th><th className="px-2 font-medium">Avg time</th><th className="px-2 font-medium">Duels</th></tr>
              </thead>
              <tbody>
                {rows.map(({ a, s }, i) => (
                  <tr key={a.id} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("w-4 text-center tabular-nums", i === 0 ? "text-amber-300" : "text-white/35")}>{i + 1}</span>
                        <ProviderIcon provider={providerOf(a.provider)} className="w-3.5 h-3.5" />
                        <span className="font-medium text-white">{a.name}</span>
                        <span className="text-white/40">{ROLES[roleOf(a.role)].label}</span>
                      </span>
                    </td>
                    <td className="px-2"><span className="rounded-md bg-[#6b8afd]/20 text-[#c7d2ff] px-1.5 py-0.5 font-semibold tabular-nums">LV {s.level}</span> <span className="text-white/35 tabular-nums">{s.xp} xp</span></td>
                    <td className="px-2 tabular-nums">{s.delivered}</td>
                    <td className="px-2 tabular-nums">{s.accepted} <span className="text-white/40">({pct(s.acceptRate)})</span></td>
                    <td className="px-2 tabular-nums">{s.costPerAcceptedCents == null ? "—" : formatUsd(s.costPerAcceptedCents)}</td>
                    <td className="px-2 tabular-nums">{mins(s.avgMinutes)}</td>
                    <td className="px-2 tabular-nums">{s.wins || s.losses ? `${s.wins}–${s.losses}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {providers.length > 1 && (
            <>
              <h3 className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/55">By provider</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {providers.map((g) => (
                  <div key={g.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <p className="text-sm font-semibold flex items-center gap-1.5"><ProviderIcon provider={g.provider} className="w-4 h-4" />{g.label} <span className="text-[11px] font-normal text-white/45">{g.agents} agent{g.agents === 1 ? "" : "s"}</span></p>
                    <p className="mt-1 text-xs text-white/70">
                      {g.accepted}/{g.delivered} accepted ({pct(g.accepted + g.sentBack ? g.accepted / (g.accepted + g.sentBack) : null)}) ·{" "}
                      {g.accepted ? `${formatUsd(Math.round(g.cost / g.accepted))} per accepted` : "no accepted work"} · {mins(g.timed ? Math.round(g.minutes / g.timed) : null)} avg{g.wins ? ` · ${g.wins} duel win${g.wins === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-white/40">Cost is only comparable where it&apos;s measured (cloud agents). Clients on your computer report their own.</p>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
