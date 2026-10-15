"use client";

// /ops/results/[id]: one project's results in one place. Header with live
// progress, the actions (Excel, To Outreach, keep going, pause), the merged
// sheet, every result with the Chief's review, the timeline, plan and final.
// Agent text is untrusted: it only ever goes through <Markdown> or plain text.

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, CalendarRange, CheckCircle2, ChevronDown, Crown, FileSpreadsheet, FileText, Flag, Gavel, Loader2, MessageSquare, Moon,
  Pause, Play, Radio, Send, Sparkles, Target, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDERS, formatUsd, providerOf } from "@/lib/ops";
import { progressLine } from "@/lib/ops-progress";
import { projectStatusLine, timelineByDay, type TimelineKind } from "@/lib/ops-results";
import { Markdown } from "@/components/ops/ops-markdown";
import { ToOutreach } from "@/components/ops/ops-to-outreach";
import { ResultsSheet } from "@/components/ops/ops-results-sheet";
import { ago, statusTone } from "@/components/ops/ops-results-index";
import { extendProjectC, setProjectStatusC } from "@/lib/client/ops";
import type { ProjectResults } from "@/lib/services/ops-results";

type P = ProjectResults["project"];
type R = ProjectResults["results"][number];

const btn = "h-8 px-3 rounded-lg border text-xs inline-flex items-center gap-1.5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]";
const card = "rounded-xl border border-white/10 bg-[#26272b] p-4";

function engineLabel(a: { cloud: boolean; provider: string; engine: string } | null) {
  if (!a) return "";
  if (!a.cloud) return `${PROVIDERS[providerOf(a.provider)].label} on your computer`;
  return a.engine === "free" ? "cloud · free models" : a.engine === "claude" ? "cloud · Claude" : "cloud · Claude, then free";
}

export function ProjectResultsView({ data }: { data: ProjectResults }) {
  const { project: p, sheet, results, final, timeline, now } = data;
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); toast.success(ok); router.refresh(); } catch (e) { toast.error((e as Error).message); } });

  // Live: an active project refreshes its numbers every minute while the tab is visible (a server re-render, no client polling state).
  useEffect(() => {
    if (p.status !== "active") return;
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 60_000);
    return () => clearInterval(id);
  }, [p.status, router]);

  const sections = [
    final && p.status === "done" ? ["final", "Final result"] : null,
    sheet.length > 1 ? ["sheet", `Sheet (${p.progress.rows})`] : null,
    ["results", `Results (${results.length})`],
    ["timeline", "Timeline"],
    p.plan ? ["plan", "Plan"] : null,
  ].filter((x): x is string[] => !!x);

  return (
    <div className="min-h-full bg-[#1e1f22] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 min-w-0">
        <Link href="/ops/results" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]">
          <ArrowLeft className="w-3.5 h-3.5" /> All project results
        </Link>

        <Header p={p} />

        {p.planError && p.status === "active" && (
          <div className="rounded-lg border border-orange-300/40 bg-orange-400/10 px-3 py-2 text-xs text-orange-50 flex gap-2" role="status">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 break-words"><b>{p.lead?.name ?? "The lead"}</b> couldn&apos;t plan: {p.planError}. Retrying on the next beat.</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {p.progress.rows > 0 && (
            <a href={`/api/ops/xlsx?project=${p.id}`} className={cn(btn, "border-emerald-300/40 text-emerald-100 hover:bg-emerald-400/10")}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel ({p.progress.rows})</a>
          )}
          {p.progress.rows > 0 && <ToOutreach projectId={p.id} big />}
          {(p.status === "done" || p.phase === "over") && (
            <select disabled={busy} value="" aria-label="Keep going"
              onChange={(e) => { const n = Number(e.target.value); if (n) run(() => extendProjectC(p.id, n), `Keeps going for ${n} more day${n === 1 ? "" : "s"}: the lead plans today.`); }}
              className="h-8 px-2 rounded-lg border border-[#6b8afd]/50 bg-[#6b8afd]/10 text-xs text-white [&>option]:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd]">
              <option value="">Keep going…</option><option value="1">+1 day</option><option value="3">+3 days</option><option value="7">+1 week</option>
            </select>
          )}
          {p.status === "active" && <button type="button" disabled={busy} onClick={() => run(() => setProjectStatusC(p.id, "paused"), "Paused.")} className={cn(btn, "border-white/15 text-white/85 hover:bg-white/10")}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pause</button>}
          {p.status === "paused" && <button type="button" disabled={busy} onClick={() => run(() => setProjectStatusC(p.id, "active"), "Resumed.")} className={cn(btn, "border-white/15 text-white/85 hover:bg-white/10")}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Resume</button>}
          {p.pageId && <Link href={`/pages/${p.pageId}`} className={cn(btn, "border-white/15 text-white/85 hover:bg-white/10")}><FileText className="w-3.5 h-3.5" /> Project page</Link>}
        </div>

        <nav aria-label="Sections" className="flex flex-wrap gap-1 text-xs">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-white/10 px-2.5 py-1 text-white/65 hover:text-white hover:bg-white/[0.06]">{label}</a>)}
        </nav>

        {final && p.status === "done" && (
          <Section id="final" title="Final result" icon={<Flag className="w-4 h-4 text-emerald-300" />}>
            <div className={cn(card, "border-emerald-300/30")}>
              <Markdown md={final.md} />
              {!final.full && p.pageId && <p className="mt-3 text-[11px] text-white/50">A summary. The full final result is on the <Link href={`/pages/${p.pageId}`} className="text-[#8ea6ff] underline underline-offset-2">project page</Link>.</p>}
            </div>
          </Section>
        )}

        {sheet.length > 1 && (
          <Section id="sheet" title="The sheet" icon={<FileSpreadsheet className="w-4 h-4 text-emerald-300" />} sub="Every table row the crew delivered, merged and deduplicated.">
            <ResultsSheet sheet={sheet} title={p.title} />
          </Section>
        )}

        <Section id="results" title="Results" icon={<CheckCircle2 className="w-4 h-4 text-[#8ea6ff]" />} sub="Each mission's deliverable, with the Chief's review.">
          {results.length ? <div className="space-y-2">{[...results].reverse().map((r) => <ResultItem key={r.id} r={r} />)}</div>
            : <p className="text-sm text-white/55">No results yet.</p>}
        </Section>

        <Section id="timeline" title="Timeline" icon={<CalendarRange className="w-4 h-4 text-[#8ea6ff]" />} sub="Plans, hand-offs, deliveries, reviews and errors, by day.">
          <Timeline items={timeline} now={now} />
        </Section>

        {p.plan && (
          <Section id="plan" title="The plan" icon={<Sparkles className="w-4 h-4 text-[#8ea6ff]" />} sub={p.lead ? `By ${p.lead.name}` : undefined}>
            <div className={card}><Markdown md={p.plan} /></div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Header({ p }: { p: P }) {
  const target = p.progress.target;
  const pct = target ? Math.round((Math.min(p.progress.rows, target) / target) * 100) : null;
  const dayPct = Math.round((Math.min(p.dayNo, p.totalDays) / Math.max(1, p.totalDays)) * 100);
  const tiles: [string, string | number, string?][] = [
    [target ? `${p.progress.unit} / ${target}` : p.progress.unit, p.progress.rows, pct != null ? `${pct}%` : undefined],
    ["WhatsApp", p.progress.whatsapp],
    ["emails", p.progress.emails],
    ["need a website", p.needWebsite],
    ["spent", formatUsd(p.spentCents), p.budgetCents ? `of ${formatUsd(p.budgetCents)}` : undefined],
    ["free runs", p.freeRuns],
  ];
  return (
    <header className={cn(card, "space-y-3")}>
      <div className="flex items-start gap-2.5">
        <Target className={cn("w-5 h-5 mt-1 shrink-0", p.status === "done" ? "text-emerald-300" : "text-[#8ea6ff]")} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{p.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60">
            <span className={cn("rounded-full border px-2 py-px", statusTone(p.status))}>{p.status}</span>
            <span>{projectStatusLine(p)}</span>
            <span>· deadline {p.deadline}</span>
            <span className="inline-flex items-center gap-1">· <Crown className="w-3 h-3" />{p.lead ? `${p.lead.name} (${engineLabel(p.lead)})` : "any Chief"}</span>
          </p>
        </div>
      </div>
      <p className="text-sm text-white/75 whitespace-pre-wrap break-words">{p.goal}</p>
      <div className="space-y-1">
        {pct != null && (
          <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Toward the goal's number" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="h-1 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Days used" aria-valuenow={p.status === "done" ? 100 : dayPct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full", p.status === "done" ? "bg-emerald-400/60" : "bg-[#6b8afd]")} style={{ width: `${p.status === "done" ? 100 : dayPct}%` }} />
        </div>
        {progressLine(p.progress) && <p className="text-[11px] text-emerald-300 tabular-nums">{progressLine(p.progress)}</p>}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="rounded-lg bg-[#303136] px-3 py-2 min-w-0">
            <dt className="text-[11px] text-white/50 truncate">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums leading-tight">{value}{sub && <span className="ml-1 text-[11px] font-normal text-white/45">{sub}</span>}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-white/50">{p.done} done · {p.review} to review · {p.active} in progress{p.late ? ` · ${p.late} late` : ""}</p>
    </header>
  );
}

function Section({ id, title, icon, sub, children }: { id: string; title: string; icon: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 min-w-0">
      <h2 id={`${id}-h`} className="text-sm font-semibold uppercase tracking-wider text-white/80 flex items-center gap-1.5">{icon}{title}</h2>
      {sub && <p className="text-[11px] text-white/45 mt-0.5">{sub}</p>}
      <div className="mt-2.5 min-w-0">{children}</div>
    </section>
  );
}

function ResultItem({ r }: { r: R }) {
  const verdict = r.chiefNote?.startsWith("✓") || r.chiefNote?.startsWith("→") ? "ok" : r.chiefNote?.startsWith("↺") ? "back" : null;
  return (
    <details className="group rounded-xl border border-white/10 bg-[#26272b] open:bg-[#2a2b30]">
      <summary className="cursor-pointer list-none px-3 py-2.5 flex items-start gap-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6b8afd] [&::-webkit-details-marker]:hidden">
        <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-white/40 -rotate-90 group-open:rotate-0 transition-transform" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium break-words">{r.title}</span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-white/55">
            <span>{r.agent ? `${r.agent.name} · ${engineLabel(r.agent)}` : "unassigned"}</span>
            <span className="font-mono">{formatUsd(r.spentCents)}{r.spentCents ? (r.costMeasured ? " measured" : " reported") : ""}</span>
            {r.freeCalls > 0 && <span>{r.freeCalls} free run{r.freeCalls === 1 ? "" : "s"}</span>}
            {r.nightShift && <span className="inline-flex items-center gap-0.5"><Moon className="w-3 h-3" /> night shift</span>}
            <span>{r.day}</span>
            <span className={cn(r.status === "done" ? "text-emerald-300" : r.status === "submitted" ? "text-amber-300" : "text-white/55")}>{r.status === "done" ? "accepted" : r.status === "submitted" ? "to review" : r.status}</span>
            {r.reviewRound > 0 && <span>round {r.reviewRound}</span>}
          </span>
        </span>
      </summary>
      <div className="px-3 pb-3 space-y-2.5 min-w-0">
        {r.chiefNote && (
          <p className={cn("rounded-lg border px-2.5 py-1.5 text-[12px] flex gap-1.5 break-words",
            verdict === "ok" ? "border-emerald-300/30 bg-emerald-400/[0.06] text-emerald-50" : verdict === "back" ? "border-amber-300/30 bg-amber-400/[0.06] text-amber-50" : "border-white/10 bg-white/[0.03] text-white/75")}>
            <Gavel className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="min-w-0"><b>Chief{r.reviewRound ? ` · round ${r.reviewRound}` : ""}:</b> {r.chiefNote}</span>
          </p>
        )}
        <Markdown md={r.deliverable} />
        {r.mission !== r.title && <p className="text-[11px] text-white/40">Mission: {r.mission}</p>}
      </div>
    </details>
  );
}

const KIND: Record<TimelineKind, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  plan: { icon: Sparkles, cls: "text-[#8ea6ff]", label: "Plan" },
  handoff: { icon: Send, cls: "text-sky-300", label: "Hand-off" },
  delivery: { icon: CheckCircle2, cls: "text-emerald-300", label: "Delivered" },
  review: { icon: Gavel, cls: "text-amber-200", label: "Review" },
  decision: { icon: Flag, cls: "text-emerald-200", label: "Decision" },
  error: { icon: AlertTriangle, cls: "text-rose-300", label: "Error" },
  radio: { icon: Radio, cls: "text-white/60", label: "Radio" },
  work: { icon: Wrench, cls: "text-white/45", label: "Work" },
};
const PER_DAY = 25;

function Timeline({ items, now }: { items: ProjectResults["timeline"]; now: number }) {
  const days = useMemo(() => timelineByDay(items), [items]);
  const [all, setAll] = useState<Record<string, boolean>>({});
  if (!days.length) return <p className="text-sm text-white/55">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-3">
      {days.map(({ day, items: list }) => {
        const open = all[day] || list.length <= PER_DAY;
        // Errors and deliveries are what matter when a day is long: those stay, the rest is folded.
        const shown = open ? list : list.filter((x) => x.kind !== "work" && x.kind !== "radio").slice(-PER_DAY);
        return (
          <li key={day} className={card}>
            <p className="text-xs font-semibold text-white/80">{day} <span className="font-normal text-white/40">· {list.length} event{list.length === 1 ? "" : "s"}</span></p>
            <ul className="mt-2 space-y-1">
              {shown.map((it, k) => {
                const K = KIND[it.kind];
                return (
                  <li key={k} className="flex items-start gap-2 text-[12px] min-w-0">
                    {/* Your local time; the server renders in its own zone, so the text may differ until hydration. */}
                    <span className="w-11 shrink-0 font-mono text-[11px] text-white/40 pt-px" title={ago(it.at, now)} suppressHydrationWarning>
                      {new Date(it.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                    <K.icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", K.cls)} aria-label={K.label} />
                    <span className="min-w-0 break-words text-white/80">{it.who && <b className="font-medium text-white">{it.who}: </b>}{it.text}</span>
                  </li>
                );
              })}
            </ul>
            {!open && (
              <button type="button" onClick={() => setAll((a) => ({ ...a, [day]: true }))} className="mt-2 text-[11px] text-[#8ea6ff] hover:text-white inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Show all {list.length}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
