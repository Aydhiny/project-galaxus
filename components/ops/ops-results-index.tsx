"use client";

// /ops/results: every project the crew is on (or finished), as cards with live
// progress toward the goal's number. Each card opens the project's results page.

import Link from "next/link";
import { ArrowLeft, ChevronRight, Clock, Crown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/ops";
import { progressLine } from "@/lib/ops-progress";
import { projectStatusLine } from "@/lib/ops-results";
import { timeAgo } from "@/components/ops/ops-feed";
import type { ResultsIndexItem } from "@/lib/services/ops-results";

export const ago = (at: string, now: number) => { const t = timeAgo(at, now); return t === "now" ? "just now" : `${t} ago`; };

export const statusTone = (status: string) =>
  status === "done" ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
  : status === "paused" ? "border-amber-300/40 bg-amber-400/10 text-amber-200"
  : status === "cancelled" ? "border-rose-300/40 bg-rose-400/10 text-rose-200"
  : "border-[#6b8afd]/50 bg-[#6b8afd]/10 text-[#c7d2ff]";

export function ResultsIndex({ projects, now }: { projects: ResultsIndexItem[]; now: number }) {
  return (
    <div className="min-h-full bg-[#1e1f22] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/ops" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd] rounded">
          <ArrowLeft className="w-3.5 h-3.5" /> Ops
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Project results</h1>
        <p className="mt-1 text-sm text-white/55">What the crew delivered on every project: the sheet, each result, and how the days went.</p>

        {projects.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-[#26272b] p-6 text-center text-sm text-white/60">
            No projects yet. Start one in <Link href="/ops" className="text-[#8ea6ff] underline underline-offset-2">Ops → Plan → Projects</Link>.
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {projects.map((p) => <li key={p.id}><ResultCard p={p} now={now} /></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResultCard({ p, now }: { p: ResultsIndexItem; now: number }) {
  const target = p.progress.target;
  const pct = target ? Math.round((Math.min(p.progress.rows, target) / target) * 100) : Math.round((Math.min(p.dayNo, p.totalDays) / Math.max(1, p.totalDays)) * 100);
  const line = progressLine(p.progress);
  return (
    <Link href={`/ops/results/${p.id}`}
      className="group block h-full rounded-xl border border-white/10 bg-[#26272b] p-4 hover:border-[#6b8afd]/50 hover:bg-[#303136] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]">
      <div className="flex items-start gap-2">
        <Target className={cn("w-4 h-4 mt-0.5 shrink-0", p.status === "done" ? "text-emerald-300" : "text-[#8ea6ff]")} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight break-words">{p.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/60">
            <span className={cn("rounded-full border px-2 py-px", statusTone(p.status))}>{p.status}</span>
            <span>{projectStatusLine(p)}</span>
          </p>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-white/30 group-hover:text-white/70" />
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label={target ? "Progress toward the goal's number" : "Days used"}>
        <div className={cn("h-full rounded-full", p.status === "done" || target ? "bg-emerald-400" : "bg-[#6b8afd]")} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-white/70 flex flex-wrap gap-x-2 gap-y-0.5">
        {line ? <span className="text-emerald-300 tabular-nums">{line}</span> : <span className="text-white/45">No sheet yet</span>}
        {p.needWebsite > 0 && <span className="text-amber-200">{p.needWebsite} need a website</span>}
      </p>
      <p className="mt-1.5 text-[11px] text-white/50 flex flex-wrap gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-1"><Crown className="w-3 h-3" />{p.lead ? `${p.lead.name}${p.lead.cloud ? " (cloud)" : ""}` : "any Chief"}</span>
        <span>{p.done} done{p.active ? ` · ${p.active} in progress` : ""}{p.late ? ` · ${p.late} late` : ""}</span>
        <span className="font-mono">{formatUsd(p.spentCents)}{p.freeRuns ? ` · ${p.freeRuns} free` : ""}</span>
        {p.lastActivity && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{ago(p.lastActivity, now)}</span>}
      </p>
    </Link>
  );
}
