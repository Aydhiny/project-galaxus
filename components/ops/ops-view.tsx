"use client";

// /ops — the agent facility. A full-bleed 3D scene with the briefing room on the
// left (plan the day, review results), the live feed + radio on the right, a
// card for whichever agent you click, and screens for connectors and skills.
// The page refreshes itself every few seconds; the scene is driven by plain
// data and never fetches anything.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Activity, ArrowLeft, Brain, Cable, ClipboardList, Cloud, Eye, Gift, Hand, Inbox as InboxIcon, MoreHorizontal, Plus, Radio as RadioIcon, Sparkles, Trash2, Trophy, UserPlus, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUILTIN_SKILLS, PRESENCE_LOOK, PROVIDERS, ROLES, TEAMS, formatUsd, presence, presenceNote, prLabel, providerOf, roleOf, type ProviderKey } from "@/lib/ops";
import { ProviderIcon } from "@/components/ops/provider-logos";
import { Briefing } from "@/components/ops/ops-briefing";
import { Feed, Radio, timeAgo } from "@/components/ops/ops-feed";
import { ConnectDialog } from "@/components/ops/ops-connect";
import { Connectors } from "@/components/ops/ops-connectors";
import { SkillsPanel } from "@/components/ops/ops-skills";
import { Scoreboard } from "@/components/ops/ops-scores";
import { RemoveAgentDialog } from "@/components/ops/ops-dialog";
import { Inbox, inboxCount } from "@/components/ops/ops-inbox";
import { BudgetDialog } from "@/components/ops/ops-budget";
import { FreeModelsDialog, freeLabel } from "@/components/ops/ops-free";
import { MemoryDialog } from "@/components/ops/ops-memory";
import type { AgentView, OpsEngine, OpsView as ViewKey } from "@/components/ops/ops-engine";
import { removeAgentC, updateAgentC, type OpsOverview } from "@/lib/client/ops";

const REFRESH_MS = 5000;
const VIEWS: { key: ViewKey; label: string }[] = [{ key: "overview", label: "Floor" }, { key: "wall", label: "Mission wall" }, { key: "table", label: "Table" }];
const DOT = { working: "bg-emerald-400", idle: "bg-amber-400", waiting: "bg-rose-400 animate-pulse", offline: "bg-slate-500", stuck: "bg-purple-400 animate-pulse", error: "bg-orange-400 animate-pulse" } as const;

export function OpsView({ data, openInbox: deepInbox = false }: { data: OpsOverview; openInbox?: boolean }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<OpsEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(data.now);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<ViewKey>("overview");
  // null = default (open on wide screens, closed on small ones, decided by CSS); true/false = you toggled it.
  const [left, setLeft] = useState<boolean | null>(null);
  // Deep link from a push notification (/ops?inbox=1) opens the inbox.
  const [right, setRight] = useState<boolean | null>(deepInbox ? true : null);
  const [rightTab, setRightTab] = useState<"inbox" | "feed" | "radio">(deepInbox ? "inbox" : "feed");
  const [dialog, setDialog] = useState<"free" | "memory" | "budget" | null>(null);
  const [connect, setConnect] = useState<ProviderKey | "cloud" | "pick" | null>(null);
  const [connectors, setConnectors] = useState(false);
  const [skillsFor, setSkillsFor] = useState<number | null | "library">(null);
  const [assignTo, setAssignTo] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [scores, setScores] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  // Side panels start just under the top bar, however many rows it wraps to.
  const bar = useRef<HTMLDivElement>(null);
  const [barBottom, setBarBottom] = useState(64);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarBottom(el.offsetTop + el.offsetHeight + 8));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hint, setHint] = useState(true);
  useEffect(() => { const t = setTimeout(() => setHint(false), 7000); return () => clearTimeout(t); }, []);

  // Keep the page live: re-render the server data every few seconds while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setNow(Date.now());
      router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  // The 3D engine, loaded on demand (three.js is big).
  useEffect(() => {
    let dead = false;
    import("@/components/ops/ops-engine").then(({ OpsEngine }) => {
      if (dead || !host.current) return;
      engine.current = new OpsEngine(host.current, { onPick: (id) => setSelected(id) });
      engine.current.run();
      setReady(true);
    });
    return () => { dead = true; engine.current?.dispose(); engine.current = null; setReady(false); };
  }, []);

  const agents: AgentView[] = useMemo(() => data.agents.map((a) => {
    const held = data.missions.find((m) => m.agentId === a.id && m.status === "claimed");
    const p = presence(a, now, { holdingSince: held?.claimedAt ?? null });
    return {
    id: a.id, name: a.name, role: roleOf(a.role), provider: providerOf(a.provider), presence: p, cloud: a.cloud,
    statusNote: presenceNote(p, a, now, data.shiftNow.state !== "off"),
    activity: a.activity, activityKind: a.activityKind, activityUrl: a.activityUrl,
    level: data.scores[a.id]?.level ?? 1,
    // A pull request the agent is on shows on its desk monitor.
    deskNote: (() => {
      const m = data.missions.find((x) => x.prUrl && (x.agentId === a.id || x.submittedBy === a.id) && (x.status === "claimed" || x.status === "submitted"));
      const pr = m?.prUrl ? data.prs[m.prUrl] : null;
      return pr ? prLabel(pr) : null;
    })(),
  };
  }), [data.agents, data.scores, data.missions, data.prs, data.shiftNow.state, now]);

  useEffect(() => {
    if (!ready) return;
    const live = data.missions.filter((m) => m.status !== "cancelled" && (m.day === data.day || m.status !== "done"));
    // Two agents on linked missions (one delegated to the other) get a link on the floor while both are on them.
    const holder = new Map(live.filter((m) => m.status === "claimed" && m.agentId).map((m) => [m.id, m.agentId!]));
    const links = live.filter((m) => m.status === "claimed" && m.parentId && m.agentId && holder.get(m.parentId) && holder.get(m.parentId) !== m.agentId)
      .map((m) => [holder.get(m.parentId!)!, m.agentId!] as [number, number]);
    engine.current?.setState(agents, live.map((m) => ({ id: m.id, title: m.title, status: m.status, budgetCents: m.budgetCents, spentCents: m.spentCents })), {
      messages: data.messages.map((m) => ({ id: m.id, from: m.fromAgentId, to: m.toAgentId, team: m.toTeam, external: m.extFrom ? "in" as const : m.extTo ? "out" as const : null, partner: (m.extFrom ?? m.extTo ?? "").split(" / ")[0] || null })),
      links,
      shift: data.shiftNow.label,
      shiftOn: data.shiftNow.state === "on",
      standupAt: data.shift?.standupAt ? new Date(data.shift.standupAt).getTime() : null,
      partners: data.links.filter((l) => l.status === "active").map((l) => l.partner),
    });
  }, [ready, agents, data.missions, data.day, data.messages, data.shiftNow, data.shift, data.links]);

  // Selecting an agent never moves the camera: it only highlights them. The view is yours.
  useEffect(() => { engine.current?.select(selected); }, [selected, ready]);

  const refresh = useCallback(() => router.refresh(), [router]);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && selected != null) setSelected(null); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [selected]);
  // First click on a "default" panel: it is open on wide screens (CSS) and closed on small ones, so flip what you currently see.
  const flip = (v: boolean | null) => (v === null ? !window.matchMedia("(min-width: 1024px)").matches : !v);
  const sel = selected != null ? data.agents.find((a) => a.id === selected) ?? null : null;
  const selView = selected != null ? agents.find((a) => a.id === selected) ?? null : null;
  const working = agents.filter((a) => a.presence === "working").length;
  const waiting = agents.filter((a) => a.presence === "waiting");
  const review = data.missions.filter((m) => m.status === "submitted").length;
  const skillName = (k: string) => data.skills.find((s) => s.key === k)?.name ?? BUILTIN_SKILLS.find((s) => s.key === k)?.name ?? null;

  const invites = data.links.filter((l) => l.status === "pending" && l.direction === "in").length;
  const unread = inboxCount(data);
  const openInbox = () => { setRightTab("inbox"); setRight(true); };
  const removingAgent = removing != null ? data.agents.find((a) => a.id === removing) ?? null : null;

  const chip = "pointer-events-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-sm text-white";

  return (
    <div className="relative h-full min-h-[36rem] overflow-hidden bg-[#1e1f22] text-white">
      <div ref={host} className="absolute inset-0" />

      {/* Top bar */}
      <div ref={bar} className="pointer-events-none absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center gap-2">
        <Link href="/empire" title="Back to your city" className={cn(chip, "w-9 px-0 justify-center")}><ArrowLeft className="w-4 h-4" /></Link>
        <span className={cn(chip, "font-hud uppercase tracking-wider text-[13px]")}>
          <span className={cn("w-2 h-2 rounded-full", waiting.length ? "bg-rose-400 animate-pulse" : working ? "bg-emerald-400 animate-pulse" : "bg-white/30")} />
          Ops · {working} working{waiting.length ? ` · ${waiting.length} need you` : ""}
        </span>
        <div className="pointer-events-auto flex rounded-xl bg-black/60 backdrop-blur-md border border-white/10 p-0.5">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => { setView(v.key); engine.current?.setView(v.key); }}
              className={cn("h-8 px-3 rounded-[10px] text-sm", view === v.key ? "bg-white text-black" : "text-white/75 hover:text-white")}>{v.label}</button>
          ))}
        </div>
        <span className="flex-1" />
        <button onClick={() => setConnect("pick")} className={cn(chip, "bg-[#6b8afd] text-[#0f1222] border-transparent font-semibold")}><UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Hire</span></button>
        <button onClick={() => setLeft(flip)} className={cn(chip, left === true && "bg-white text-black", left === null && "lg:bg-white lg:text-black")}>
          <ClipboardList className="w-4 h-4" /> Plan{review > 0 && <span className="ml-0.5 rounded-full bg-amber-400 text-black text-[11px] px-1.5 font-bold">{review}</span>}
        </button>
        <button onClick={() => setRight(flip)} className={cn(chip, right === true && "bg-white text-black", right === null && "lg:bg-white lg:text-black")}><Activity className="w-4 h-4" /> Live</button>
        <button onClick={openInbox} aria-label="Inbox" className={cn(chip, "relative", unread > 0 && "border-amber-300/50")}>
          <InboxIcon className="w-4 h-4" /><span className="hidden md:inline">Inbox</span>
          {unread > 0 && <span className="ml-0.5 rounded-full bg-amber-400 text-black text-[11px] px-1.5 font-bold">{unread}</span>}
        </button>
        <button onClick={() => setDialog("free")} title="Free models: what your agents can still use today when Claude runs out"
          className={cn(chip, "hidden sm:inline-flex", data.free.usableCount ? "text-emerald-200" : "text-white/60")}>
          <Gift className="w-4 h-4" /><span className="text-xs">{freeLabel(data.free)}</span>
        </button>
        <div className="relative pointer-events-auto">
          <button onClick={() => setMore((o) => !o)} aria-expanded={more} aria-label="More" className={cn(chip, "w-9 px-0 justify-center relative")}>
            <MoreHorizontal className="w-4 h-4" />
            {invites > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-black text-[10px] font-bold inline-flex items-center justify-center">{invites}</span>}
          </button>
          {more && (
            <div className="absolute right-0 top-11 z-30 w-56 rounded-xl bg-[#303136] border border-white/10 p-1 shadow-xl" onMouseLeave={() => setMore(false)}>
              {([
                [Cable, "Connectors", invites ? `${invites} link invite${invites === 1 ? "" : "s"}` : "Clients, cloud, linked facilities", () => setConnectors(true)],
                [Sparkles, "Skills", "What your agents know how to do", () => setSkillsFor("library")],
                [Gift, "Free models", `${freeLabel(data.free)} · switch when Claude runs out`, () => setDialog("free")],
                [Brain, "Shared memory", "What every agent knows about you", () => setDialog("memory")],
                [Wallet, "Budget & alerts", data.budget.paused ? "Paused by a usage limit" : "Spend per day, model, notifications", () => setDialog("budget")],
                [Trophy, "Scoreboard", "Levels, accept rate, cost, wins", () => setScores(true)],
              ] as const).map(([Icon, label, hint, go]) => (
                <button key={label} onClick={() => { setMore(false); go(); }} className="w-full flex items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]">
                  <Icon className="w-4 h-4 mt-0.5 text-[#8ea6ff]" />
                  <span><span className="block text-sm text-white">{label}</span><span className="block text-[11px] text-white/50">{hint}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Claude's login expired: everything is running on free models until it's fixed. */}
        {data.claudeLoginExpired && (
          <div className="basis-full flex justify-center">
            <div className="pointer-events-auto w-[min(40rem,100%)] rounded-xl bg-orange-500/90 border border-orange-200/40 px-3 py-2 text-xs text-white shadow-lg">
              <b>Claude can&apos;t log in{data.claudeMode === "runner" ? " on your GitHub runner" : ""}</b> (401: the token expired), so agents are on free models only.
              {data.claudeMode === "runner"
                ? <> Fix: run <code className="font-mono bg-black/25 px-1 rounded">claude setup-token</code> on your PC and paste the result into GitHub → your repo → Settings → Secrets → <code className="font-mono bg-black/25 px-1 rounded">CLAUDE_CODE_OAUTH_TOKEN</code>.</>
                : <> Fix: paste a new Anthropic API key in Connections → Claude.</>}
            </div>
          </div>
        )}

        {/* Needs you: in the bar's own flow, so it sits under however many rows the buttons wrap to. */}
        {waiting.length > 0 && (
          <div className="basis-full flex justify-center">
            <div className="w-[min(36rem,100%)] space-y-1">
              {waiting.slice(0, 3).map((a) => (
                <button key={a.id} onClick={() => setSelected(a.id)} className="pointer-events-auto w-full flex items-center gap-2 rounded-xl bg-rose-600/90 border border-rose-300/40 px-3 py-2 text-left text-sm shadow-lg">
                  <Hand className="w-4 h-4 shrink-0" />
                  <span className="font-semibold shrink-0">{a.name} needs you</span>
                  <span className="truncate text-white/85">· {a.activity ?? "waiting for your permission"}</span>
                  <span className="ml-auto text-[11px] text-white/70 shrink-0 hidden sm:inline">in {a.cloud ? "Galaxus cloud" : PROVIDERS[a.provider].label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* How to move (fades after a few seconds) */}
      {hint && (
        <p className="pointer-events-none absolute z-10 bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 text-[11px] text-white/75 whitespace-nowrap hidden sm:block">
          Drag to look · right-drag to move · scroll to zoom · WASD to walk, Q/E to turn
        </p>
      )}

      {/* Briefing (left) */}
      {left !== false && (
        <aside className={cn(`absolute z-20 left-3 right-3 sm:right-auto sm:w-[22rem] bottom-3 overflow-y-auto rounded-2xl bg-[#26272b]/92 backdrop-blur-md border border-white/12 p-3 lg:z-10`, left === null && "hidden lg:block")} style={{ top: barBottom }}>
          <Briefing data={data} assignTo={assignTo} onChanged={refresh} />
        </aside>
      )}

      {/* Live feed + radio (right) */}
      {right !== false && (
        <aside className={cn(`absolute z-20 left-3 right-3 sm:left-auto sm:w-80 bottom-3 overflow-y-auto rounded-2xl bg-[#26272b]/92 backdrop-blur-md border border-white/12 p-3 lg:z-10`, right === null && "hidden lg:block")} style={{ top: barBottom }}>
          <div className="flex items-center gap-1 mb-2">
            {(["inbox", "feed", "radio"] as const).map((t) => (
              <button key={t} onClick={() => setRightTab(t)} className={cn("h-7 px-2.5 rounded-lg text-xs inline-flex items-center gap-1", rightTab === t ? "bg-white text-black" : "text-white/65 hover:text-white")}>
                {t === "inbox" ? <InboxIcon className="w-3.5 h-3.5" /> : t === "feed" ? <Activity className="w-3.5 h-3.5" /> : <RadioIcon className="w-3.5 h-3.5" />}
                {t === "inbox" ? "Inbox" : t === "feed" ? "Feed" : "Radio"}
                {t === "inbox" && unread > 0 && <span className="rounded-full bg-amber-400 text-black text-[10px] px-1 font-bold">{unread}</span>}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-[#8ea6ff] truncate">{sel ? sel.name : "everyone"}</span>
          </div>
          {rightTab === "inbox" ? <Inbox data={data} now={now} onChanged={refresh} />
            : rightTab === "feed" ? <Feed data={data} now={now} onlyAgent={selected} onPick={(id) => setSelected(id)} />
            : <Radio data={data} now={now} onlyAgent={selected} onSent={refresh} />}
        </aside>
      )}

      {/* Empty facility */}
      {data.agents.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto max-w-md rounded-2xl bg-[#26272b]/92 backdrop-blur-md border border-white/12 p-5 text-center">
            <Eye className="w-7 h-7 mx-auto text-[#6b8afd]" />
            <h2 className="mt-2 text-lg font-bold">The facility is empty</h2>
            <p className="mt-1 text-sm text-white/65">Hire a cloud agent (runs on your Claude, nothing to install) or connect Claude Code, Codex, Gemini or Cursor. Then plan the day and watch them work.</p>
            <div className="mt-3 flex justify-center gap-2">
              <button onClick={() => setConnect("cloud")} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#6b8afd] text-[#0f1222] text-sm font-semibold"><Cloud className="w-4 h-4" /> Cloud agent</button>
              <button onClick={() => setConnect("claude")} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-white/20 text-sm"><Plus className="w-4 h-4" /> Connect a client</button>
            </div>
          </div>
        </div>
      )}

      {/* Selected agent */}
      {sel && selView && (
        <div className="absolute z-20 bottom-3 left-1/2 -translate-x-1/2 w-[min(34rem,calc(100%-1.5rem))] rounded-2xl bg-[#26272b]/94 backdrop-blur-md border border-white/12 p-3">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-white/8 flex items-center justify-center">
              {selView.cloud ? <Cloud className="w-6 h-6 text-sky-300" /> : <ProviderIcon provider={selView.provider} className="w-6 h-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">
                {sel.name} <span className="ml-1 rounded-md bg-[#6b8afd]/20 text-[#c7d2ff] px-1.5 py-0.5 text-[10px] font-semibold align-middle">LV {data.scores[sel.id]?.level ?? 1}</span>
                <span className="text-xs font-normal text-white/50"> · {ROLES[selView.role].label} · {selView.cloud ? "Galaxus cloud" : PROVIDERS[selView.provider].label}</span>
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: TEAMS[ROLES[selView.role].team].hex }}>{TEAMS[ROLES[selView.role].team].label}</p>
              <p className="mt-1 text-sm text-white/85 break-words">
                <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", DOT[selView.presence])} />
                <b style={{ color: PRESENCE_LOOK[selView.presence].hex }} className="mr-1">{PRESENCE_LOOK[selView.presence].label}:</b>
                {selView.presence === "stuck" || selView.presence === "error" ? <span className="text-white/85">{selView.statusNote}</span>
                  : selView.presence === "offline" ? `Not connected${sel.lastSeenAt ? ` · last seen ${timeAgo(sel.lastSeenAt, now)} ago` : " yet"}`
                  : selView.presence === "waiting" ? <b className="text-rose-200">Needs you: {selView.activity ?? "waiting for permission"}</b>
                  : selView.activity ?? (selView.cloud ? (data.shiftNow.state === "on" ? "On standby: takes the next open mission" : "Off duty until the next shift") : "Waiting for orders")}
              </p>
              {selView.activityUrl && selView.presence !== "offline" && (
                <a href={selView.activityUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-[11px] text-[#8ea6ff] hover:underline break-all">{selView.activityUrl.slice(0, 80)}</a>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {sel.skills.map((k) => skillName(k)).filter(Boolean).map((n) => <span key={n} className="rounded-full bg-violet-400/15 text-violet-100 px-2 py-0.5 text-[10px]">{n}</span>)}
                <button onClick={() => setSkillsFor(sel.id)} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:text-white inline-flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> skills</button>
              </div>
              {sel.cloud && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                  <span className="text-white/50 mr-0.5">Runs on</span>
                  {([["auto", "Auto"], ["claude", "Claude"], ["free", "Free models"]] as const).map(([k, label]) => (
                    <button key={k} onClick={async () => { try { await updateAgentC(sel.id, { engine: k }); refresh(); } catch (e) { toast.error((e as Error).message); } }}
                      title={k === "auto" ? "Claude, and free models when Claude runs out" : k === "claude" ? "Only Claude: waits when your plan is used up" : "Only free models: never touches your Claude plan"}
                      className={cn("h-6 px-2 rounded-md border", sel.engine === k ? "border-[#6b8afd]/70 bg-[#6b8afd]/20 text-white" : "border-white/10 text-white/60 hover:text-white")}>{label}</button>
                  ))}
                </div>
              )}
              {data.scores[sel.id]?.delivered ? (
                <p className="mt-1 text-[11px] text-white/50">
                  {data.scores[sel.id].accepted}/{data.scores[sel.id].delivered} accepted
                  {data.scores[sel.id].costPerAcceptedCents != null && ` · ${formatUsd(data.scores[sel.id].costPerAcceptedCents!)} per accepted`}
                  {data.scores[sel.id].wins ? ` · ${data.scores[sel.id].wins} duel wins` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button onClick={() => { setAssignTo(sel.id); setLeft(true); }} className="h-8 px-3 rounded-lg bg-[#6b8afd] text-[#0f1222] text-xs font-semibold">Give a mission</button>
            <button onClick={() => { setRightTab("radio"); setRight(true); }} className="h-8 px-3 rounded-lg border border-white/15 text-xs text-white/80 hover:bg-white/10 inline-flex items-center gap-1"><RadioIcon className="w-3.5 h-3.5" /> Radio</button>
            <button onClick={() => engine.current?.focus(sel.id)} className="h-8 px-3 rounded-lg border border-white/15 text-xs text-white/80 hover:bg-white/10 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Look at</button>
            <button onClick={() => setSelected(null)} className="h-8 px-3 rounded-lg border border-white/15 text-xs text-white/80 hover:bg-white/10">Close</button>
            <button onClick={() => setRemoving(sel.id)} className="ml-auto h-8 px-2.5 rounded-lg text-xs text-rose-300 hover:bg-rose-400/10 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
          </div>
        </div>
      )}

      {/* Budget strip */}
      {data.totals.budgetCents > 0 && (
        <div className="absolute z-10 bottom-3 right-3 hidden lg:flex items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 px-3 h-9 text-xs font-mono"
          style={{ marginRight: right !== false ? "20.5rem" : 0 }}>
          <span className="text-white/50">today</span>
          <span className={data.totals.spentCents > data.totals.budgetCents ? "text-rose-300" : "text-emerald-300"}>{formatUsd(data.totals.spentCents)}</span>
          <span className="text-white/40">/ {formatUsd(data.totals.budgetCents)}</span>
        </div>
      )}

      {connect && (
        <ConnectDialog onClose={() => setConnect(null)} onCreated={refresh} preset={connect === "pick" ? undefined : connect}
          claudeMode={data.claudeMode} shiftEnds={data.shift?.endsAt ?? null} />
      )}
      {connectors && <Connectors data={data} now={now} onClose={() => setConnectors(false)} onChanged={refresh} onConnect={(p) => { setConnectors(false); setConnect(p); }} />}
      {scores && <Scoreboard data={data} onClose={() => setScores(false)} />}
      {dialog === "free" && <FreeModelsDialog data={data} onClose={() => setDialog(null)} onChanged={refresh} />}
      {dialog === "memory" && <MemoryDialog onClose={() => setDialog(null)} />}
      {dialog === "budget" && <BudgetDialog data={data} onClose={() => setDialog(null)} onChanged={refresh} />}
      {removingAgent && (
        <RemoveAgentDialog
          agent={{ name: removingAgent.name, role: roleOf(removingAgent.role), provider: providerOf(removingAgent.provider), cloud: removingAgent.cloud }}
          holding={data.missions.filter((m) => m.agentId === removingAgent.id && m.status === "claimed").length}
          onClose={() => setRemoving(null)}
          action={async () => { await removeAgentC(removingAgent.id); setSelected(null); toast.success(`${removingAgent.name} removed.`); refresh(); }} />
      )}
      {skillsFor != null && <SkillsPanel data={data} agentId={skillsFor === "library" ? null : skillsFor} onClose={() => setSkillsFor(null)} onChanged={refresh} />}
    </div>
  );
}
