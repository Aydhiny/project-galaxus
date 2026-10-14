"use client";

// Connectors: everything that feeds the facility, and whether it's healthy.
// Every provider (observed via hooks or self-reported), who is connected on it
// and when it last signalled, the cloud runner, and the endpoints.

import { useTransition } from "react";
import { toast } from "sonner";
import { Cloud, ExternalLink, Loader2, Play, Plus, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PROVIDERS, PROVIDER_KEYS, presence, providerOf, type ProviderKey } from "@/lib/ops";
import { ProviderIcon } from "@/components/ops/provider-logos";
import { Copy_ } from "@/components/ops/ops-connect";
import { timeAgo } from "@/components/ops/ops-feed";
import { dispatchNowC, type OpsOverview } from "@/lib/client/ops";

const DOT = { working: "bg-emerald-400", idle: "bg-amber-400", waiting: "bg-rose-400 animate-pulse", offline: "bg-slate-500" } as const;
const MODE = {
  runner: { ok: true, text: "Your GitHub Actions runner (your Claude subscription)" },
  api: { ok: true, text: "Your Anthropic API key (runs right away, billed to the key)" },
  none: { ok: false, text: "Not connected: cloud agents wait until you connect Claude" },
} as const;

export function Connectors({ data, now, onClose, onConnect, onChanged }: {
  data: OpsOverview; now: number; onClose: () => void; onConnect: (preset: ProviderKey | "cloud") => void; onChanged: () => void;
}) {
  const [busy, start] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cloud = data.agents.filter((a) => a.cloud);
  const byProvider = (p: ProviderKey) => data.agents.filter((a) => !a.cloud && providerOf(a.provider) === p);
  const mode = MODE[data.claudeMode] ?? MODE.none;

  const startNow = () => start(async () => {
    try {
      const r = (await dispatchNowC()) as { dispatched: number; reason?: string };
      toast.success(r.dispatched ? `${r.dispatched} cloud agent${r.dispatched === 1 ? "" : "s"} started.` : r.reason ? `Nothing started: ${r.reason}.` : "Nothing to start: no open missions for idle cloud agents.");
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl border border-white/15 bg-[#26272b] text-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Connectors</h2>
            <p className="text-xs text-white/55 mt-0.5">Every client and runner that feeds the facility. Connect as many as you like; each agent is one identity.</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-white/10 inline-flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {/* Cloud runner */}
        <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-sky-400/15 inline-flex items-center justify-center"><Cloud className="w-5 h-5 text-sky-300" /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Galaxus cloud <span className="ml-1 text-[10px] rounded-full bg-emerald-400/15 text-emerald-300 px-1.5 py-0.5">observed</span></p>
              <p className={cn("text-xs mt-0.5", mode.ok ? "text-white/65" : "text-amber-200")}>{mode.text}</p>
              <p className="text-xs text-white/50 mt-1">{cloud.length ? `${cloud.length} cloud agent${cloud.length === 1 ? "" : "s"}: ${cloud.map((a) => a.name).join(", ")}` : "No cloud agents yet."} They take missions every ~10 minutes during your shift.</p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {!mode.ok && <Link href="/connections" className="h-8 px-3 rounded-lg bg-amber-300 text-black text-xs font-semibold inline-flex items-center">Connect Claude</Link>}
              <button onClick={() => onConnect("cloud")} className="h-8 px-3 rounded-lg border border-white/15 text-xs inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Cloud agent</button>
              {cloud.length > 0 && mode.ok && (
                <button onClick={startNow} disabled={busy} className="h-8 px-3 rounded-lg bg-[#6b8afd] text-[#0f1222] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Start now
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Clients */}
        <h3 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8ea6ff]">Clients on your computer</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {PROVIDER_KEYS.map((p) => {
            const list = byProvider(p);
            const last = list.reduce<Date | null>((m, a) => (a.lastSeenAt && (!m || new Date(a.lastSeenAt) > m) ? new Date(a.lastSeenAt) : m), null);
            const observed = !!PROVIDERS[p].hook;
            return (
              <div key={p} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-white/8 inline-flex items-center justify-center"><ProviderIcon provider={p} className="w-5 h-5" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{PROVIDERS[p].label}</p>
                    <p className="text-[11px] text-white/50">
                      <span className={observed ? "text-emerald-300/90" : "text-white/50"}>{observed ? "observed (hooks)" : "self-reported"}</span>
                      {last ? ` · last signal ${timeAgo(last, now)} ago` : list.length ? " · never connected" : ""}
                    </p>
                  </div>
                  <button onClick={() => onConnect(p)} className="h-7 px-2 rounded-lg border border-white/15 text-[11px] inline-flex items-center gap-1 hover:bg-white/10" aria-label={`Connect ${PROVIDERS[p].label}`}><Plus className="w-3 h-3" /> Connect</button>
                </div>
                {list.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {list.map((a) => {
                      const pr = presence(a, now);
                      return (
                        <li key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px]">
                          <span className={cn("w-1.5 h-1.5 rounded-full", DOT[pr])} />{a.name}{pr === "waiting" && <span className="text-rose-300"> needs you</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Endpoints */}
        <h3 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8ea6ff]">Endpoints</h3>
        <div className="space-y-2 text-xs">
          <div><p className="text-white/55 mb-1">MCP server (every client, with the agent&apos;s bearer token)</p><Copy_ text={`${origin}/api/mcp`} /></div>
          <div>
            <p className="text-white/55 mb-1 flex items-center gap-1">Hook script for Claude Code, Codex, Gemini CLI and Cursor <a href="/agent-hook.mjs" target="_blank" rel="noopener noreferrer" className="text-[#8ea6ff] inline-flex items-center gap-0.5 hover:underline">read it <ExternalLink className="w-3 h-3" /></a></p>
            <Copy_ text={`${origin}/agent-hook.mjs`} />
          </div>
        </div>
      </div>
    </div>
  );
}
