"use client";

// Projects: give the crew a goal and a deadline (e.g. 14 days). Each working
// day the lead plans that day's missions; each evening the day goes on the
// project page; on the deadline the lead writes the final solution there.

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarRange, FileText, Loader2, Pause, Play, Plus, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLES, formatUsd, roleOf } from "@/lib/ops";
import { ConfirmDialog, btnPrimary, field } from "@/components/ops/ops-dialog";
import { createProjectC, setProjectStatusC, type OpsOverview } from "@/lib/client/ops";

type Project = OpsOverview["projects"][number];

export function Projects({ data, onChanged }: { data: OpsOverview; onChanged: () => void }) {
  const [creating, setCreating] = useState(data.projects.length === 0);
  return (
    <div className="space-y-3">
      {data.projects.map((p) => <ProjectCard key={p.id} p={p} data={data} onChanged={onChanged} />)}
      {creating ? <NewProject data={data} onDone={() => { setCreating(false); onChanged(); }} onCancel={data.projects.length ? () => setCreating(false) : undefined} />
        : <button onClick={() => setCreating(true)} className={cn(btnPrimary, "w-full h-9")}><Plus className="w-4 h-4" /> New project</button>}
    </div>
  );
}

function ProjectCard({ p, data, onChanged }: { p: Project; data: OpsOverview; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [busy, start] = useTransition();
  const lead = p.leadAgentId ? data.agents.find((a) => a.id === p.leadAgentId) : null;
  const pct = Math.round((Math.min(p.dayNo, p.totalDays) / p.totalDays) * 100);
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } });
  return (
    <div className={cn("rounded-xl border p-3", p.status === "done" ? "border-emerald-300/30 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.04]")}>
      <div className="flex items-start gap-2">
        <Target className={cn("w-4 h-4 mt-0.5", p.status === "done" ? "text-emerald-300" : "text-[#8ea6ff]")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{p.title}</p>
          <p className="text-[11px] text-white/55 mt-0.5">
            {p.status === "done" ? "Done: final solution on the page" : p.status === "paused" ? "Paused" : p.phase === "final" ? "Deadline today: final solution" : `Day ${p.dayNo} of ${p.totalDays} · ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left`}
            {lead ? ` · lead ${lead.name}${lead.cloud ? " (cloud)" : ""}` : " · no lead: any Chief"}
          </p>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className={cn("h-full rounded-full", p.status === "done" ? "bg-emerald-400" : "bg-[#6b8afd]")} style={{ width: `${p.status === "done" ? 100 : pct}%` }} /></div>
      <p className="mt-1.5 text-[11px] text-white/60 flex flex-wrap gap-x-2">
        <span>{p.done} done</span>{p.review > 0 && <span className="text-amber-300">{p.review} to review</span>}<span>{p.active} in progress</span>
        {p.late > 0 && <span className="text-rose-300">{p.late} late</span>}
        <span className="font-mono">{formatUsd(p.spentCents)}{p.budgetCents ? ` / ${formatUsd(p.budgetCents)}` : ""}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.pageId && <Link href={`/pages/${p.pageId}`} className="h-7 px-2.5 rounded-lg border border-white/15 text-xs text-white/85 hover:bg-white/10 inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Project page</Link>}
        {p.status === "active" && <button disabled={busy} onClick={() => run(() => setProjectStatusC(p.id, "paused"), "Paused.")} className="h-7 px-2.5 rounded-lg border border-white/15 text-xs text-white/80 inline-flex items-center gap-1"><Pause className="w-3.5 h-3.5" /> Pause</button>}
        {p.status === "paused" && <button disabled={busy} onClick={() => run(() => setProjectStatusC(p.id, "active"), "Resumed.")} className="h-7 px-2.5 rounded-lg border border-white/15 text-xs text-white/80 inline-flex items-center gap-1"><Play className="w-3.5 h-3.5" /> Resume</button>}
        {p.status !== "done" && <button onClick={() => setCancelling(true)} className="ml-auto h-7 px-2.5 rounded-lg text-xs text-rose-300 hover:bg-rose-400/10 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>}
      </div>
      {cancelling && (
        <ConfirmDialog title={`Cancel "${p.title}"?`} confirm="Cancel project" danger onClose={() => setCancelling(false)}
          body={<p>The lead stops planning it and its open missions come off the board. Results so far stay on the project page.</p>}
          action={async () => { await setProjectStatusC(p.id, "cancelled"); toast.success("Cancelled."); onChanged(); }} />
      )}
    </div>
  );
}

function NewProject({ data, onDone, onCancel }: { data: OpsOverview; onDone: () => void; onCancel?: () => void }) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState(14);
  const [lead, setLead] = useState<number | "">(data.agents.find((a) => a.role === "chief" && a.cloud)?.id ?? data.agents.find((a) => a.role === "chief")?.id ?? "");
  const [budget, setBudget] = useState("");
  const [busy, start] = useTransition();
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        try {
          await createProjectC({ title, goal, days, leadAgentId: lead || null, budgetUsd: budget });
          toast.success("Project started. The lead plans day 1 now.");
          onDone();
        } catch (err) { toast.error((err as Error).message); }
      });
    }} className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8ea6ff] flex items-center gap-1.5"><CalendarRange className="w-3.5 h-3.5" /> New project</p>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Name, e.g. Earn 500 KM/month editing" className={field} />
      <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={4} maxLength={6000} className={field}
        placeholder="What you want at the end, and anything they should know. e.g. A concrete plan to get my first 3 editing clients in Sarajevo: where to find them, what to charge, scripts to send, my portfolio gaps." />
      <div>
        <p className="text-[11px] text-white/55 mb-1">Deadline</p>
        <div className="flex flex-wrap gap-1">
          {[3, 7, 14, 30].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={cn("rounded-full px-3 py-1 text-xs border", days === d ? "bg-[#6b8afd]/20 border-[#6b8afd]/60 text-[#c7d2ff]" : "border-white/10 text-white/60 hover:text-white")}>{d} days</button>
          ))}
          <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} aria-label="Days" className={cn(field, "w-20 py-1")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-white/55">Lead
          <select value={lead} onChange={(e) => setLead(e.target.value ? Number(e.target.value) : "")} className={cn(field, "mt-0.5 [&>option]:text-black")}>
            <option value="">Any Chief</option>
            {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES[roleOf(a.role)].label}{a.cloud ? ", cloud" : ""})</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-white/55">Budget ($, whole project)
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="none" className={cn(field, "mt-0.5")} />
        </label>
      </div>
      <p className="text-[10px] text-white/45">A cloud lead plans each working day on your Claude (a few cents a day, from your daily share). A lead on your computer gets a “plan today” mission instead. Days run on your shift; with no shift, 08:00–21:00.</p>
      <div className="flex gap-1.5">
        <button disabled={busy || title.trim().length < 3 || goal.trim().length < 15} className={cn(btnPrimary, "flex-1")}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Start project</button>
        {onCancel && <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg border border-white/15 text-sm text-white/80">Cancel</button>}
      </div>
    </form>
  );
}
