"use client";

// The briefing room: plan the day's missions (what to research, prepare, build,
// buy, how much money) and review what the agents hand back.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronDown, Cloud, CornerDownRight, Copy, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_TEMPLATES, MISSION_KINDS, MISSION_KIND_INFO, ROLES, budgetState, formatUsd, type MissionKind, type RoleKey } from "@/lib/ops";
import { acceptMissionC, applyTemplateC, cancelMissionC, createMissionC, reopenMissionC, repeatLastDayC, setDayC, type OpsOverview } from "@/lib/client/ops";

type Mission = OpsOverview["missions"][number];

const BUDGET_TINT = { none: "", ok: "text-emerald-300", near: "text-amber-300", over: "text-rose-300" } as const;
const field = "w-full rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#6b8afd]/60";

export function Briefing({ data, assignTo, onChanged }: { data: OpsOverview; assignTo: number | null; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<MissionKind>("research");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [budget, setBudget] = useState("");
  const [busy, start] = useTransition();

  // "Give a mission" on an agent card pre-aims the form at them.
  const [lastAssign, setLastAssign] = useState<number | null>(null);
  if (assignTo !== lastAssign) { setLastAssign(assignTo); if (assignTo != null) { setAgentId(assignTo); const a = data.agents.find((x) => x.id === assignTo); if (a) { const k = MISSION_KINDS.find((m) => MISSION_KIND_INFO[m].role === a.role); if (k) setKind(k); } } }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await createMissionC({ title, brief, kind, agentId, budgetUsd: budget });
        setTitle(""); setBrief(""); setBudget(""); setAgentId(null);
        toast.success("Mission posted to the board.");
        onChanged();
      } catch (err) { toast.error((err as Error).message); }
    });
  }

  const live = data.missions.filter((m) => m.status !== "cancelled");
  const groups: { key: string; label: string; items: Mission[]; tone: string }[] = [
    { key: "review", label: "Needs your review", items: live.filter((m) => m.status === "submitted"), tone: "text-amber-300" },
    { key: "active", label: "In progress", items: live.filter((m) => m.status === "claimed"), tone: "text-sky-300" },
    { key: "open", label: "Open", items: live.filter((m) => m.status === "open"), tone: "text-white/70" },
    { key: "done", label: "Done", items: live.filter((m) => m.status === "done" && m.day === data.day), tone: "text-emerald-300" },
  ];
  const defaultRole: RoleKey = MISSION_KIND_INFO[kind].role;

  return (
    <div className="space-y-4">
      <DayPlan data={data} onChanged={onChanged} />

      <div className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2 text-xs">
        <span className="text-white/60">Today&apos;s budget</span>
        <span className="font-mono tabular-nums">
          <span className={data.totals.spentCents > data.totals.budgetCents && data.totals.budgetCents > 0 ? "text-rose-300" : "text-emerald-300"}>{formatUsd(data.totals.spentCents)}</span>
          <span className="text-white/40"> / {data.totals.budgetCents ? formatUsd(data.totals.budgetCents) : "no limit"}</span>
        </span>
      </div>

      <form onSubmit={submit} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8ea6ff]">New mission</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should they do?" maxLength={200} className={field} />
        <div className="flex flex-wrap gap-1">
          {MISSION_KINDS.map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} title={MISSION_KIND_INFO[k].hint}
              className={cn("rounded-full px-2.5 py-1 text-xs border transition-colors", kind === k ? "bg-[#6b8afd]/20 border-[#6b8afd]/60 text-[#c7d2ff]" : "border-white/10 text-white/60 hover:text-white")}>
              {MISSION_KIND_INFO[k].label}
            </button>
          ))}
        </div>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} maxLength={6000} placeholder="Details, constraints, what a good result looks like…" className={field} />
        <div className="grid grid-cols-[1fr_6.5rem] gap-2">
          <select value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : null)} className={cn(field, "[&>option]:text-black")}>
            <option value="">Any {ROLES[defaultRole].label}</option>
            {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES[a.role as RoleKey]?.label ?? a.role}{a.cloud ? ", cloud" : ""})</option>)}
          </select>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="budget" className={cn(field, "pl-6")} />
          </div>
        </div>
        <button disabled={busy || !title.trim()} className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[#6b8afd] text-[#0f1222] text-sm font-semibold disabled:opacity-40 active:scale-[.98] transition-transform">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Post mission
        </button>
        <p className="text-[11px] text-white/40">Cloud agents start right away; agents on your computer pull missions when they run. Budgets are tracked from what agents report; they are not enforced on your own machine.</p>
      </form>

      {live.length === 0 && <p className="text-sm text-white/50 text-center py-4">No missions yet. Post one above and a matching agent will pick it up.</p>}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.key}>
          <h3 className={cn("text-[11px] font-semibold uppercase tracking-wider mb-1.5", g.tone)}>{g.label} · {g.items.length}</h3>
          <ul className="space-y-2">{g.items.map((m) => <MissionCard key={m.id} m={m} data={data} onChanged={onChanged} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function MissionCard({ m, data, onChanged }: { m: Mission; data: OpsOverview; onChanged: () => void }) {
  const [open, setOpen] = useState(m.status === "submitted");
  const [busy, start] = useTransition();
  const agent = m.agentId != null ? data.agents.find((a) => a.id === m.agentId) : null;
  const who = agent ? agent.name : m.role ? `Any ${ROLES[m.role as RoleKey]?.label ?? m.role}` : "Anyone";
  const by = m.createdByAgentId != null ? data.agents.find((a) => a.id === m.createdByAgentId)?.name ?? "an agent" : null;
  const parent = m.parentId != null ? data.missions.find((x) => x.id === m.parentId) : null;
  const bs = budgetState(m.budgetCents, m.spentCents);

  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.04]">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-2 p-2.5 text-left">
        <div className="min-w-0 flex-1">
          {parent && <p className="text-[10px] text-white/40 flex items-center gap-0.5 truncate"><CornerDownRight className="w-3 h-3" /> part of {parent.title}</p>}
          <p className="text-sm font-medium leading-snug">{m.title}</p>
          <p className="mt-0.5 text-[11px] text-white/50 flex flex-wrap gap-x-2">
            <span>{MISSION_KIND_INFO[m.kind as MissionKind]?.label ?? m.kind}</span>
            <span className="inline-flex items-center gap-0.5">→ {agent?.cloud && <Cloud className="w-3 h-3 text-sky-300" />}{who}</span>
            {by && <span className="text-violet-300/80">from {by}</span>}
            {m.budgetCents ? <span className={cn("font-mono", BUDGET_TINT[bs])}>{formatUsd(m.spentCents)}/{formatUsd(m.budgetCents)}{bs === "over" ? " over!" : ""}</span> : m.spentCents ? <span className="font-mono">{formatUsd(m.spentCents)} spent</span> : null}
          </p>
        </div>
        <ChevronDown className={cn("w-4 h-4 mt-0.5 text-white/40 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {m.brief && <p className="text-xs text-white/60 whitespace-pre-wrap">{m.brief}</p>}
          {m.deliverable && (
            <div className="rounded-lg bg-black/40 border border-white/10 p-2.5">
              <p className="text-[11px] font-semibold text-[#8ea6ff] mb-1">{m.deliverableTitle || "Result"}</p>
              {/* Written by an agent: shown as plain text, never as HTML. */}
              <pre className="text-xs text-white/85 whitespace-pre-wrap break-words font-sans max-h-72 overflow-y-auto">{m.deliverable}</pre>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {m.status === "submitted" && (
              <>
                <Btn tone="go" busy={busy} onClick={() => run(() => acceptMissionC(m.id), "Accepted.")}><Check className="w-3.5 h-3.5" /> Accept</Btn>
                <Btn busy={busy} onClick={() => {
                  const note = window.prompt("What should they fix? (optional, added to the brief)");
                  if (note === null) return;
                  run(() => reopenMissionC(m.id, note), "Sent back to the board.");
                }}><RotateCcw className="w-3.5 h-3.5" /> Send back</Btn>
              </>
            )}
            {m.status === "claimed" && <Btn busy={busy} onClick={() => run(() => reopenMissionC(m.id), "Back on the board.")}><RotateCcw className="w-3.5 h-3.5" /> Release</Btn>}
            {m.status !== "done" && <Btn tone="danger" busy={busy} onClick={() => run(() => cancelMissionC(m.id), "Cancelled.")}><X className="w-3.5 h-3.5" /> Cancel</Btn>}
          </div>
        </div>
      )}
    </li>
  );
}

function Btn({ children, onClick, busy, tone }: { children: React.ReactNode; onClick: () => void; busy: boolean; tone?: "go" | "danger" }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={cn("inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium border disabled:opacity-50",
        tone === "go" ? "bg-emerald-400/20 border-emerald-300/50 text-emerald-100" : tone === "danger" ? "border-rose-300/30 text-rose-200 hover:bg-rose-400/10" : "border-white/15 text-white/80 hover:bg-white/10")}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  );
}

/** Today's shift, focus and one-click day plans. */
function DayPlan({ data, onChanged }: { data: OpsOverview; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(data.shift?.startsAt ?? "09:00");
  const [endsAt, setEndsAt] = useState(data.shift?.endsAt ?? "17:00");
  const [focus, setFocus] = useState(data.shift?.focus ?? "");
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); setEditing(false); onChanged(); } catch (e) { toast.error((e as Error).message); }
  });
  const on = data.shiftNow.state === "on";

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CalendarClock className={cn("w-4 h-4", on ? "text-emerald-300" : "text-white/50")} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8ea6ff]">Today{data.shift ? ` · ${data.shift.startsAt}–${data.shift.endsAt}` : ""}</p>
          <p className={cn("text-xs", on ? "text-emerald-200" : "text-white/60")}>{data.shiftNow.label}</p>
        </div>
        <button onClick={() => setEditing((e) => !e)} className="h-7 px-2.5 rounded-lg border border-white/15 text-[11px] hover:bg-white/10">{editing ? "Close" : data.shift ? "Edit" : "Set shift"}</button>
      </div>
      {data.shift?.focus && !editing && <p className="text-xs text-white/75">Focus: {data.shift.focus}</p>}

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => setDayC({ startsAt, endsAt, focus }), "Shift saved."); }} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-white/55">Starts<input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={cn(field, "mt-0.5")} /></label>
            <label className="text-[11px] text-white/55">Ends<input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={cn(field, "mt-0.5")} /></label>
          </div>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={1000} placeholder="Today's focus, e.g. land 2 clients" className={field} />
          <p className="text-[10px] text-white/40">An end before the start runs past midnight (e.g. 10:00–02:00). Cloud agents only work inside the shift.</p>
          <div className="flex gap-1.5">
            <button disabled={busy} className="h-8 px-3 rounded-lg bg-[#6b8afd] text-[#0f1222] text-xs font-semibold disabled:opacity-50">Save shift</button>
            {data.shift && <button type="button" disabled={busy} onClick={() => run(() => setDayC(null), "Shift cleared: agents work any time.")} className="h-8 px-3 rounded-lg border border-white/15 text-xs">No shift</button>}
          </div>
        </form>
      )}

      <div>
        <p className="text-[11px] text-white/50 mb-1">Plan the day in one click</p>
        <div className="flex flex-wrap gap-1">
          {DAY_TEMPLATES.map((t) => (
            <button key={t.key} disabled={busy} title={`${t.blurb} · ${t.startsAt}–${t.endsAt} · ${t.missions.length} missions`}
              onClick={() => window.confirm(`${t.label}: set today's shift to ${t.startsAt}–${t.endsAt} and post ${t.missions.length} missions?`) && run(() => applyTemplateC(t.key), `${t.label} is on the board.`)}
              className="rounded-full px-2.5 py-1 text-[11px] border border-white/10 text-white/75 hover:border-[#6b8afd]/50 hover:text-white disabled:opacity-50">{t.label}</button>
          ))}
          <button disabled={busy} onClick={() => run(() => repeatLastDayC(), "The last day's plan is on today's board.")}
            className="rounded-full px-2.5 py-1 text-[11px] border border-white/10 text-white/60 hover:text-white inline-flex items-center gap-1 disabled:opacity-50"><Copy className="w-3 h-3" /> Repeat last day</button>
        </div>
      </div>
    </section>
  );
}
