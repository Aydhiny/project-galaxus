"use client";

// Reach doctor (Agent Reach's `doctor`, for Galaxus): probes each channel the
// agents and scrapers use, and shows which backend answered — or why none did.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Globe, Loader2, XCircle } from "lucide-react";
import { reachDoctorNowC } from "@/lib/client/ops";

type Row = { channel: string; ok: boolean; route: string; error: string | null };
const LABEL: Record<string, string> = { web: "Read any page", search: "Web search", reddit: "Reddit", rss: "RSS feeds", youtube: "YouTube" };

export function ReachDoctor() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-[#8ea6ff]" />
        <p className="text-sm font-semibold">Reach · the internet for every agent</p>
        <button disabled={busy} onClick={() => start(async () => { try { setRows(await reachDoctorNowC()); } catch (e) { toast.error((e as Error).message); } })}
          className="ml-auto h-7 px-2.5 rounded-lg border border-white/15 text-xs inline-flex items-center gap-1 hover:bg-white/10">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Run doctor
        </button>
      </div>
      <p className="mt-1 text-[11px] text-white/55">
        Free, keyless routes (Agent Reach&apos;s design): pages via direct ▸ Jina Reader ▸ Exa, search via Exa, Reddit via RSS. Gig radar, Scout and the community finder use it too.
        Agents call reach_search, reach_read, reach_reddit, reach_youtube.
      </p>
      {rows && (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.channel} className="flex items-start gap-2 text-xs">
              {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 text-rose-400 shrink-0" />}
              <span className="w-28 shrink-0 text-white/80">{LABEL[r.channel] ?? r.channel}</span>
              <span className="text-white/55 break-words min-w-0">{r.ok ? `via ${r.route}` : (r.error ?? "unavailable").slice(0, 160)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-white/45">
        On your PC, give local agents more (YouTube transcripts, logged-in sites): tell your agent “Install Agent Reach:{" "}
        <a href="https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md" target="_blank" rel="noopener noreferrer" className="text-[#8ea6ff] hover:underline inline-flex items-center gap-0.5">install.md <ExternalLink className="w-3 h-3" /></a>”.
      </p>
    </div>
  );
}
