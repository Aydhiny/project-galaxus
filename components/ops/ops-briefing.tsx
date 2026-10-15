"use client";

// The plan panel, in four tabs so it stays simple:
//   Board    — what needs you, what's running, what's open, what's done
//   New      — post a mission (title + Post; everything else under "More options")
//   Projects — multi-day goals with a deadline; the lead plans each day
//   Day      — shift hours, focus, one-click day plans, stand-up and debrief

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock, Check, ChevronDown, Crown, FileSpreadsheet, Maximize2, Cloud, CornerDownRight, Copy, FileText, Gift, GitPullRequest, HelpCircle, Link2, Loader2, Megaphone, Plus, Repeat, RotateCcw, Swords, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_TEMPLATES, EFFORTS, MISSION_KINDS, MISSION_KIND_INFO, ROLES, WEEKDAYS, budgetState, describeRepeat, formatUsd, isLate, mergeTables, prLabel, roleOf,
  type Effort, type MissionKind, type RoleKey,
} from "@/lib/ops";
import { ConfirmDialog, Dialog, PromptDialog, btnGhost, btnPrimary, field } from "@/components/ops/ops-dialog";
import { UseIt } from "@/components/ops/ops-use";
import { Markdown } from "@/components/ops/ops-markdown";
import { Projects } from "@/components/ops/ops-projects";
import { BudgetMeter } from "@/components/ops/ops-budget";
import { ToOutreach } from "@/components/ops/ops-to-outreach";
import { RanOn } from "@/components/ops/ops-ran-on";
import {
  acceptMissionC, applyTemplateC, cancelMissionC, createMissionC, debriefNowC, removeRecurringC, reopenMissionC, repeatLastDayC, setDayC, standupNowC,
  type OpsOverview,
} from "@/lib/client/ops";

type Mission = OpsOverview["missions"][number];
type Tab = "board" | "new" | "projects" | "day";
const BUDGET_TINT = { none: "", ok: "text-emerald-300", near: "text-amber-300", over: "text-rose-300" } as const;

export function Briefing({ data, assignTo, onChanged }: { data: OpsOverview; assignTo: number | null; onChanged: () => void }) {
  const review = data.missions.filter((m) => m.status === "submitted").length;
  const [tab, setTab] = useState<Tab>(review ? "board" : data.missions.length ? "board" : "new");
  // "Give a mission" on an agent card opens the form aimed at them.
  const [lastAssign, setLastAssign] = useState<number | null>(null);
  if (assignTo !== lastAssign) { setLastAssign(assignTo); if (assignTo != null) setTab("new"); }

  return (
    <div className="space-y-3">
      <div className="flex rounded-xl bg-white/[0.05] p-0.5" role="tablist">
        {([["board", `Board${review ? ` · ${review}` : ""}`], ["new", "New"], ["projects", `Projects${data.projects.filter((p) => p.status === "active").length ? ` · ${data.projects.filter((p) => p.status === "active").length}` : ""}`], ["day", "Day"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("flex-1 h-8 rounded-[10px] text-xs font-medium", tab === k ? "bg-white text-black" : "text-white/65 hover:text-white")}>{label}</button>
        ))}
      </div>
      {tab === "board" && <Board data={data} onChanged={onChanged} onNew={() => setTab("new")} />}
      {tab === "new" && <NewMission data={data} assignTo={assignTo} onPosted={() => { onChanged(); setTab("board"); }} />}
      {tab === "projects" && <Projects data={data} onChanged={onChanged} />}
      {tab === "day" && <DayPlan data={data} onChanged={onChanged} />}
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

function Board({ data, onChanged, onNew }: { data: OpsOverview; onChanged: () => void; onNew: () => void }) {
  const [compare, setCompare] = useState<number | null>(null);
  const live = data.missions.filter((m) => m.status !== "cancelled" || m.duelId != null);
  const groups: { key: string; label: string; items: Mission[]; tone: string }[] = [
    { key: "review", label: "Needs your review", items: live.filter((m) => m.status === "submitted"), tone: "text-amber-300" },
    { key: "active", label: "In progress", items: live.filter((m) => m.status === "claimed"), tone: "text-[#8ea6ff]" },
    { key: "open", label: "Open", items: live.filter((m) => m.status === "open"), tone: "text-white/70" },
    { key: "done", label: "Done today", items: live.filter((m) => m.status === "done" && m.day === data.day), tone: "text-emerald-300" },
  ];
  const total = data.totals;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2 text-xs">
        <span className="text-white/60">Spent today</span>
        <span className="font-mono tabular-nums">
          <span className={total.spentCents > total.budgetCents && total.budgetCents > 0 ? "text-rose-300" : "text-emerald-300"}>{formatUsd(total.spentCents)}</span>
          <span className="text-white/40"> / {total.budgetCents ? formatUsd(total.budgetCents) : "no limit"}</span>
        </span>
      </div>
      {data.agents.some((a) => a.cloud) && (
        <details className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
          <summary className="cursor-pointer text-xs text-white/60 select-none">
            Cloud budget · {formatUsd(data.budget.leftToday)} left today{data.budget.paused ? " · paused" : ""}
            {data.free.usableCount > 0 && (data.budget.exhausted || data.budget.paused) && data.budget.freeFallback ? " · free models covering" : ""}
          </summary>
          <div className="mt-2"><BudgetMeter b={data.budget} /></div>
        </details>
      )}
      {live.filter((m) => m.status !== "cancelled").length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-white/55">Nothing on the board.</p>
          <button onClick={onNew} className={cn(btnPrimary, "mt-3 h-8 text-xs")}><Plus className="w-3.5 h-3.5" /> Post a mission</button>
        </div>
      )}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.key}>
          <h3 className={cn("text-[11px] font-semibold uppercase tracking-wider mb-1.5", g.tone)}>{g.label} · {g.items.length}</h3>
          <ul className="space-y-2">{g.items.map((m) => <MissionCard key={m.id} m={m} data={data} onChanged={onChanged} onCompare={setCompare} />)}</ul>
        </section>
      ))}
      {data.recurring.length > 0 && <RecurringList data={data} onChanged={onChanged} />}
      {compare != null && <CompareDialog duelId={compare} data={data} onClose={() => setCompare(null)} onChanged={onChanged} />}
    </div>
  );
}

function MissionCard({ m, data, onChanged, onCompare }: { m: Mission; data: OpsOverview; onChanged: () => void; onCompare: (duelId: number) => void }) {
  const [open, setOpen] = useState(m.status === "submitted");
  const [dialog, setDialog] = useState<"sendback" | "cancel" | "read" | null>(null);
  const [busy, start] = useTransition();
  const agent = m.agentId != null ? data.agents.find((a) => a.id === m.agentId) : null;
  const who = agent ? agent.name : m.role ? `Any ${ROLES[roleOf(m.role)].label}` : "Anyone";
  const by = m.createdByAgentId != null ? data.agents.find((a) => a.id === m.createdByAgentId)?.name ?? "an agent" : null;
  const parent = m.parentId != null ? data.missions.find((x) => x.id === m.parentId) : null;
  const bs = budgetState(m.budgetCents, m.spentCents);
  const pr = m.prUrl ? data.prs[m.prUrl] : undefined;
  const rival = m.duelId != null ? data.missions.find((x) => x.duelId === m.duelId && x.id !== m.id) : null;
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } });

  return (
    <li className={cn("rounded-xl border bg-white/[0.04]", m.status === "submitted" ? "border-amber-300/30" : "border-white/10")}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-2 p-2.5 text-left">
        <div className="min-w-0 flex-1">
          {parent && <p className="text-[10px] text-white/40 flex items-center gap-0.5 truncate"><CornerDownRight className="w-3 h-3" /> part of {parent.title}</p>}
          <p className="text-sm font-medium leading-snug">
            {m.duelId != null && <Swords className="inline w-3.5 h-3.5 mr-1 text-amber-300" aria-label="Head-to-head" />}
            {m.recurringId != null && <Repeat className="inline w-3 h-3 mr-1 text-white/45" aria-label="Repeats" />}
            {m.title}
          </p>
          <p className="mt-0.5 text-[11px] text-white/50 flex flex-wrap gap-x-2">
            <span>{MISSION_KIND_INFO[m.kind as MissionKind]?.label ?? m.kind}</span>
            <span className="inline-flex items-center gap-0.5">→ {agent?.cloud && <Cloud className="w-3 h-3 text-sky-300" />}{who}</span>
            {by && <span className="text-violet-300/80">from {by}</span>}
            {m.budgetCents ? <span className={cn("font-mono", BUDGET_TINT[bs])}>{formatUsd(m.spentCents)}/{formatUsd(m.budgetCents)}{bs === "over" ? " over!" : ""}</span>
              : m.spentCents ? <span className="font-mono">{formatUsd(m.spentCents)}</span> : null}
            {m.dueDay && m.status !== "done" && m.status !== "cancelled" && (
              <span className={isLate({ status: m.status, dueDay: String(m.dueDay) }, data.day) ? "text-rose-300 font-semibold" : String(m.dueDay) === data.day ? "text-amber-200" : "text-white/55"}>
                {isLate({ status: m.status, dueDay: String(m.dueDay) }, data.day) ? `late (was due ${String(m.dueDay).slice(5)})` : String(m.dueDay) === data.day ? "due today" : `due ${String(m.dueDay).slice(5)}`}
              </span>
            )}
            {m.waitingOn != null && <span className="text-rose-200 inline-flex items-center gap-0.5"><HelpCircle className="w-3 h-3" />waiting for your answer</span>}
            {m.requestLinkId != null && !m.requestFromLabel && <span className="text-sky-200 inline-flex items-center gap-0.5"><Link2 className="w-3 h-3" />at a linked facility</span>}
            {m.requestFromLabel && <span className="text-sky-200 inline-flex items-center gap-0.5"><Link2 className="w-3 h-3" />for {m.requestFromLabel}</span>}
            {m.status === "claimed" && m.jobId === 0 && !m.ranOn && <span className="text-emerald-200 inline-flex items-center gap-0.5"><Gift className="w-3 h-3" />free model</span>}
            <RanOn ranOn={m.ranOn} running={m.status === "claimed"} />
            {m.effort !== "normal" && <span className="text-white/40">{m.effort}</span>}
            {m.spentCents > 0 && <span className={m.costMeasured ? "text-emerald-300/80" : "text-white/40"} title={m.costMeasured ? "From the run's real usage (on a subscription this is the API-equivalent cost)" : "As reported by the agent"}>{m.costMeasured ? "measured" : "reported"}</span>}
          </p>
          {pr && <p className="mt-0.5 text-[11px] text-white/70 inline-flex items-center gap-1"><GitPullRequest className="w-3 h-3" />{prLabel(pr)}</p>}
        </div>
        <ChevronDown className={cn("w-4 h-4 mt-0.5 text-white/40 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {m.brief && <p className="text-xs text-white/60 whitespace-pre-wrap">{m.brief}</p>}
          {m.prUrl && <a href={m.prUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-[11px] text-[#8ea6ff] hover:underline break-all">{pr?.title ?? m.prUrl}</a>}
          {m.chiefNote && (
            <div className={cn("rounded-lg border px-2.5 py-2 text-xs flex gap-2", m.chiefNote.startsWith("⋯") ? "border-white/10 bg-white/[0.03] text-white/60" : "border-amber-300/30 bg-amber-300/[0.07] text-amber-50")}>
              <Crown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
              <span><b className="font-semibold">Chief{m.reviewRound ? ` · step ${m.reviewRound + 1}` : ""}:</b> {m.chiefNote}</span>
            </div>
          )}
          {m.deliverable && (
            <div className="rounded-lg bg-black/30 border border-white/10 p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[11px] font-semibold text-[#8ea6ff] flex-1 min-w-0 truncate">{m.deliverableTitle || "Result"}</p>
                {mergeTables([m.deliverable]).length > 1 && <a href={`/api/ops/xlsx?mission=${m.id}`} className="text-[11px] text-emerald-200 hover:text-white inline-flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" /> Excel</a>}
                {mergeTables([m.deliverable]).length > 1 && <ToOutreach missionId={m.id} />}
                <button onClick={() => setDialog("read")} className="text-[11px] text-white/55 hover:text-white inline-flex items-center gap-1"><Maximize2 className="w-3 h-3" /> Read</button>
              </div>
              {/* Written by an agent: rendered from markdown into plain React text, never HTML. */}
              <div className="max-h-80 overflow-y-auto pr-1"><Markdown md={m.deliverable} /></div>
            </div>
          )}
          {dialog === "read" && m.deliverable && (
            <Dialog wide title={m.deliverableTitle || m.title} sub={`${who}${m.chiefNote && !m.chiefNote.startsWith("⋯") ? ` · Chief: ${m.chiefNote}` : ""}`} onClose={() => setDialog(null)}>
              <Markdown md={m.deliverable} className="text-sm" />
            </Dialog>
          )}
          <div className="flex flex-wrap gap-1.5">
            {m.status === "submitted" && rival?.status === "submitted" && (
              <Btn tone="go" busy={busy} onClick={() => onCompare(m.duelId!)}><Swords className="w-3.5 h-3.5" /> Compare & pick</Btn>
            )}
            {m.status === "submitted" && !(rival?.status === "submitted") && (
              <Btn tone="go" busy={busy} onClick={() => run(() => acceptMissionC(m.id), "Accepted.")}><Check className="w-3.5 h-3.5" /> Accept</Btn>
            )}
            {m.status === "submitted" && <Btn busy={busy} onClick={() => setDialog("sendback")}><RotateCcw className="w-3.5 h-3.5" /> Send back</Btn>}
            {(m.status === "submitted" || m.status === "done") && <UseIt m={m} />}
            {m.status === "claimed" && <Btn busy={busy} onClick={() => run(() => reopenMissionC(m.id), "Back on the board.")}><RotateCcw className="w-3.5 h-3.5" /> Release</Btn>}
            {m.status !== "done" && m.status !== "cancelled" && <Btn tone="danger" busy={busy} onClick={() => setDialog("cancel")}><X className="w-3.5 h-3.5" /> Cancel</Btn>}
          </div>
        </div>
      )}
      {dialog === "sendback" && (
        <PromptDialog title="Send it back" sub="Your note is added to the brief, so the next attempt knows what to fix." placeholder="e.g. Add prices in KM and links for each option" confirm="Send back" optional
          onClose={() => setDialog(null)} action={async (note) => { await reopenMissionC(m.id, note); toast.success("Sent back to the board."); onChanged(); }} />
      )}
      {dialog === "cancel" && (
        <ConfirmDialog title={`Cancel "${m.title}"?`} confirm="Cancel mission" danger onClose={() => setDialog(null)}
          body={<p>{m.status === "claimed" ? `${agent?.name ?? "The agent"} is working on it right now; it stops being able to submit.` : "It comes off the board."} Anything already delivered stays readable.</p>}
          action={async () => { await cancelMissionC(m.id); toast.success("Cancelled."); onChanged(); }} />
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

/** Head-to-head: both results side by side; the one you pick is accepted, the other closes. */
function CompareDialog({ duelId, data, onClose, onChanged }: { duelId: number; data: OpsOverview; onClose: () => void; onChanged: () => void }) {
  const pair = data.missions.filter((m) => m.duelId === duelId);
  const [busy, start] = useTransition();
  const name = (id: number | null) => data.agents.find((a) => a.id === id)?.name ?? "Agent";
  return (
    <Dialog title={`Head-to-head: ${pair[0]?.title ?? ""}`} sub="Pick the better result. It's accepted and its agent gets the win; the other closes." onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        {pair.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/10 bg-black/25 p-3 flex flex-col">
            <p className="text-sm font-semibold">{name(m.submittedBy ?? m.agentId)}</p>
            <p className="text-[11px] text-white/50 mb-2">{formatUsd(m.spentCents)}{m.costMeasured ? " measured" : ""}{m.claimedAt && m.submittedAt ? ` · ${Math.max(1, Math.round((new Date(m.submittedAt).getTime() - new Date(m.claimedAt).getTime()) / 60000))} min` : ""}</p>
            <div className="flex-1 max-h-[50vh] overflow-y-auto pr-1">{m.deliverable ? <Markdown md={m.deliverable} /> : <p className="text-xs text-white/50">(not delivered yet)</p>}</div>
            <button disabled={busy || m.status !== "submitted"} className={cn(btnPrimary, "mt-3 h-8 text-xs")}
              onClick={() => start(async () => { try { await acceptMissionC(m.id); toast.success(`${name(m.submittedBy ?? m.agentId)} wins.`); onChanged(); onClose(); } catch (e) { toast.error((e as Error).message); } })}>
              Pick this one
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function RecurringList({ data, onChanged }: { data: OpsOverview; onChanged: () => void }) {
  const [removing, setRemoving] = useState<OpsOverview["recurring"][number] | null>(null);
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-white/55">Repeating · {data.recurring.length}</h3>
      <ul className="space-y-1">
        {data.recurring.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
            <Repeat className="w-3.5 h-3.5 text-white/45 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-white/85 truncate">{r.title}</span>
              <span className="block text-[10px] text-white/45">{describeRepeat(r.days, r.time)}{r.agentId ? ` · ${data.agents.find((a) => a.id === r.agentId)?.name ?? ""}` : r.role ? ` · any ${ROLES[roleOf(r.role)].label}` : ""}</span>
            </span>
            <button onClick={() => setRemoving(r)} className="h-7 w-7 rounded-md text-white/40 hover:text-rose-300 hover:bg-rose-400/10 inline-flex items-center justify-center" aria-label={`Stop repeating ${r.title}`}><Trash2 className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmDialog title={`Stop repeating "${removing.title}"?`} confirm="Stop repeating" danger onClose={() => setRemoving(null)}
          body={<p>No new copies will be posted. Copies already on the board stay.</p>}
          action={async () => { await removeRecurringC(removing.id); toast.success("Stopped."); onChanged(); }} />
      )}
    </section>
  );
}

// ─── New mission ──────────────────────────────────────────────────────────────

function NewMission({ data, assignTo, onPosted }: { data: OpsOverview; assignTo: number | null; onPosted: () => void }) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<MissionKind>("research");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [budget, setBudget] = useState("");
  const [repeat, setRepeat] = useState("once");
  const [repeatTime, setRepeatTime] = useState("09:00");
  const [duel, setDuel] = useState<number[]>([]);
  const [duelOn, setDuelOn] = useState(false);
  const [effort, setEffort] = useState<Effort>("normal");
  const [due, setDue] = useState("");
  const [partner, setPartner] = useState("");
  const [more, setMore] = useState(false);
  const partners = data.links.filter((l) => l.status === "active");
  const [busy, start] = useTransition();

  const [lastAssign, setLastAssign] = useState<number | null>(null);
  if (assignTo !== lastAssign) {
    setLastAssign(assignTo);
    if (assignTo != null) {
      setAgentId(assignTo); setMore(true);
      const a = data.agents.find((x) => x.id === assignTo);
      const k = a && MISSION_KINDS.find((x) => MISSION_KIND_INFO[x].role === a.role);
      if (k) setKind(k);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const r = await createMissionC({
          title, brief, kind, agentId: duelOn ? null : agentId, budgetUsd: budget, repeat, repeatTime, duelAgentIds: duelOn ? duel : undefined,
          effort, dueInDays: due, partnerLinkId: partner ? Number(partner) : undefined,
        });
        setTitle(""); setBrief(""); setBudget(""); setAgentId(null); setRepeat("once"); setDuel([]); setDuelOn(false); setDue(""); setPartner(""); setEffort("normal");
        toast.success(partner ? "Request sent to the linked facility." : r.recurring ? "Repeating mission saved." : r.duel ? "Head-to-head posted." : "Mission posted.");
        onPosted();
      } catch (err) { toast.error((err as Error).message); }
    });
  }
  const defaultRole: RoleKey = MISSION_KIND_INFO[kind].role;

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should they do?" maxLength={200} className={field} />
      <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} maxLength={6000} placeholder="Details, and what a good result looks like (optional)" className={field} />
      <div className="flex flex-wrap gap-1">
        {MISSION_KINDS.map((k) => (
          <button type="button" key={k} onClick={() => setKind(k)} title={MISSION_KIND_INFO[k].hint}
            className={cn("rounded-full px-2.5 py-1 text-xs border transition-colors", kind === k ? "bg-[#6b8afd]/20 border-[#6b8afd]/60 text-[#c7d2ff]" : "border-white/10 text-white/60 hover:text-white")}>
            {MISSION_KIND_INFO[k].label}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setMore((o) => !o)} className="text-xs text-white/55 hover:text-white inline-flex items-center gap-1" aria-expanded={more}>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", more && "rotate-180")} /> More options
      </button>
      {more && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <div>
            <p className="text-[11px] text-white/55">Effort <span className="text-white/40">(cloud cost: quick runs on the cheapest model{data.budget.freeFirst && data.free.usableCount ? " or a free one" : ""})</span></p>
            <div className="mt-0.5 grid grid-cols-3 gap-1">
              {EFFORTS.map((e) => (
                <button type="button" key={e} onClick={() => setEffort(e)}
                  className={cn("h-7 rounded-lg border text-xs capitalize", effort === e ? "border-[#6b8afd]/70 bg-[#6b8afd]/15" : "border-white/10 text-white/65 hover:text-white")}>{e}</button>
              ))}
            </div>
          </div>
          <label className="block text-[11px] text-white/55">Due
            <select value={due} onChange={(e) => setDue(e.target.value)} className={cn(field, "mt-0.5 [&>option]:text-black")}>
              <option value="">No deadline</option>
              <option value="0">Today</option>
              <option value="1">Tomorrow</option>
              <option value="3">In 3 days</option>
              <option value="7">In a week</option>
              <option value="14">In 2 weeks</option>
            </select>
          </label>
          {partners.length > 0 && (
            <label className="block text-[11px] text-white/55">Ask a linked facility instead
              <select value={partner} onChange={(e) => { setPartner(e.target.value); if (e.target.value) { setDuelOn(false); setRepeat("once"); } }} className={cn(field, "mt-0.5 [&>option]:text-black")}>
                <option value="">No, my own crew</option>
                {partners.map((l) => <option key={l.id} value={l.id}>{l.partner}&apos;s facility</option>)}
              </select>
            </label>
          )}
          {!duelOn && !partner && (
            <label className="block text-[11px] text-white/55">Who
              <select value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : null)} className={cn(field, "mt-0.5 [&>option]:text-black")}>
                <option value="">Any {ROLES[defaultRole].label}</option>
                {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES[roleOf(a.role)].label}{a.cloud ? ", cloud" : ""})</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-white/55">Budget ($)
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="none" className={cn(field, "mt-0.5")} />
            </label>
            <label className="block text-[11px] text-white/55">Repeat
              <select value={repeat} onChange={(e) => setRepeat(e.target.value)} disabled={duelOn} className={cn(field, "mt-0.5 [&>option]:text-black")}>
                <option value="once">Once</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekends">Weekends</option>
                {WEEKDAYS.map((d) => <option key={d} value={d.toLowerCase()}>Every {d}</option>)}
              </select>
            </label>
          </div>
          {repeat !== "once" && (
            <label className="block text-[11px] text-white/55">At
              <input type="time" value={repeatTime} onChange={(e) => setRepeatTime(e.target.value)} className={cn(field, "mt-0.5")} />
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-white/75">
            <input type="checkbox" checked={duelOn} onChange={(e) => { setDuelOn(e.target.checked); if (e.target.checked) setRepeat("once"); }} className="accent-[#6b8afd]" />
            <Swords className="w-3.5 h-3.5 text-amber-300" /> Head-to-head: two agents, you pick the better result
          </label>
          {duelOn && (
            <div className="flex flex-wrap gap-1">
              {data.agents.map((a) => {
                const on = duel.includes(a.id);
                return (
                  <button type="button" key={a.id} onClick={() => setDuel((d) => (on ? d.filter((x) => x !== a.id) : [...d, a.id].slice(-2)))}
                    className={cn("rounded-full px-2.5 py-1 text-xs border", on ? "bg-amber-300/20 border-amber-300/60 text-amber-100" : "border-white/10 text-white/60 hover:text-white")}>{a.name}</button>
                );
              })}
              <p className="w-full text-[10px] text-white/40">{duel.length}/2 picked. Great for comparing providers on the same work.</p>
            </div>
          )}
        </div>
      )}

      <button disabled={busy || !title.trim() || (duelOn && duel.length !== 2)} className={cn(btnPrimary, "w-full")}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {repeat !== "once" ? "Save repeating mission" : "Post mission"}
      </button>
      <p className="text-[11px] text-white/40">Cloud agents start right away; agents on your computer pick it up when they run.</p>
    </form>
  );
}

// ─── Day ──────────────────────────────────────────────────────────────────────

function DayPlan({ data, onChanged }: { data: OpsOverview; onChanged: () => void }) {
  const [editing, setEditing] = useState(!data.shift);
  const [startsAt, setStartsAt] = useState(data.shift?.startsAt ?? "09:00");
  const [endsAt, setEndsAt] = useState(data.shift?.endsAt ?? "17:00");
  const [focus, setFocus] = useState(data.shift?.focus ?? "");
  const [template, setTemplate] = useState<(typeof DAY_TEMPLATES)[number] | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => { try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } });
  const on = data.shiftNow.state === "on";

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CalendarClock className={cn("w-4 h-4", on ? "text-emerald-300" : "text-white/50")} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{data.shift ? `${data.shift.startsAt}–${data.shift.endsAt}` : "No shift set"}</p>
            <p className={cn("text-xs", on ? "text-emerald-200" : "text-white/55")}>{data.shiftNow.label}</p>
          </div>
          {!editing && <button onClick={() => setEditing(true)} className="h-7 px-2.5 rounded-lg border border-white/15 text-[11px] hover:bg-white/10">Edit</button>}
        </div>
        {data.shift?.focus && !editing && <p className="text-xs text-white/75">Focus: {data.shift.focus}</p>}
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await setDayC({ startsAt, endsAt, focus }); setEditing(false); }, "Shift saved."); }} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-white/55">Starts<input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={cn(field, "mt-0.5")} /></label>
              <label className="text-[11px] text-white/55">Ends<input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={cn(field, "mt-0.5")} /></label>
            </div>
            <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={1000} placeholder="Today's focus, e.g. land 2 clients" className={field} />
            <p className="text-[10px] text-white/40">An end before the start runs past midnight (10:00–02:00 works). Cloud agents work inside the shift; it starts with a stand-up and ends with a debrief.</p>
            <div className="flex gap-1.5">
              <button disabled={busy} className={cn(btnPrimary, "h-8 text-xs")}>Save shift</button>
              {data.shift && <button type="button" disabled={busy} onClick={() => run(async () => { await setDayC(null); setEditing(false); }, "Shift cleared: agents work any time.")} className={cn(btnGhost, "h-8 text-xs")}>No shift</button>}
              {data.shift && <button type="button" onClick={() => setEditing(false)} className="ml-auto text-xs text-white/50 hover:text-white">Close</button>}
            </div>
          </form>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => run(() => standupNowC(), "Stand-up called. Watch the holo table.")}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-left hover:bg-white/[0.07] disabled:opacity-50">
          <Megaphone className="w-4 h-4 text-[#8ea6ff]" />
          <p className="mt-1 text-xs font-semibold">Stand-up now</p>
          <p className="text-[10px] text-white/50">{data.shift?.standupAt ? "Already held today" : "Crew meets at the table"}</p>
        </button>
        <button disabled={busy} onClick={() => run(async () => { const r = await debriefNowC(); if (r.pageId) window.open(`/pages/${r.pageId}`, "_blank", "noopener"); }, "Debrief saved to Pages.")}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-left hover:bg-white/[0.07] disabled:opacity-50">
          <FileText className="w-4 h-4 text-[#8ea6ff]" />
          <p className="mt-1 text-xs font-semibold">Debrief now</p>
          <p className="text-[10px] text-white/50">One page: done, cost, blocked, tomorrow</p>
        </button>
      </section>
      {data.shift?.debriefPageId && <Link href={`/pages/${data.shift.debriefPageId}`} className="block text-xs text-[#8ea6ff] hover:underline">Open today&apos;s debrief</Link>}

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-1.5">Plan the day in one click</p>
        <div className="grid grid-cols-2 gap-1.5">
          {DAY_TEMPLATES.map((t) => (
            <button key={t.key} disabled={busy} onClick={() => setTemplate(t)}
              className="rounded-lg border border-white/10 px-2.5 py-2 text-left hover:border-[#6b8afd]/50 disabled:opacity-50">
              <span className="block text-xs font-medium">{t.label}</span>
              <span className="block text-[10px] text-white/45">{t.startsAt}–{t.endsAt} · {t.missions.length} missions</span>
            </button>
          ))}
          <button disabled={busy} onClick={() => run(() => repeatLastDayC(), "The last day's plan is on today's board.")}
            className="rounded-lg border border-white/10 px-2.5 py-2 text-left hover:border-[#6b8afd]/50 disabled:opacity-50">
            <span className="flex items-center gap-1 text-xs font-medium"><Copy className="w-3 h-3" /> Repeat last day</span>
            <span className="block text-[10px] text-white/45">Same shift and missions</span>
          </button>
        </div>
      </section>
      {template && (
        <ConfirmDialog title={template.label} confirm={`Post ${template.missions.length} missions`} onClose={() => setTemplate(null)}
          body={<>
            <p>Sets today&apos;s shift to {template.startsAt}–{template.endsAt} with the focus “{template.focus}”, and posts:</p>
            <ul className="mt-1 space-y-0.5">{template.missions.map((m) => <li key={m.title}>• {m.title}{m.budgetUsd ? ` ($${m.budgetUsd})` : ""}</li>)}</ul>
          </>}
          action={async () => { await applyTemplateC(template.key); toast.success(`${template.label} is on the board.`); onChanged(); }} />
      )}
    </div>
  );
}
