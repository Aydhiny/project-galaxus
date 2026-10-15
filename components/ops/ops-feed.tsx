"use client";

// Live feed (what each agent is doing, newest first) and the radio (you ↔
// agents, agents ↔ agents). Everything here was written by an agent or a
// hook, so it renders as plain text, and links only ever open http(s) pages.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Radio as RadioIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeIcon } from "@/components/ops/provider-logos";
import { TEAMS, TEAM_KEYS, providerOf, type TeamKey } from "@/lib/ops";
import { badgeFor, parseRanOn, runEngineOf, runLabel, runShort } from "@/lib/ops-run-engine";
import { sendMessageC, type OpsOverview } from "@/lib/client/ops";

export const KIND_ICON: Record<string, string> = {
  browse: "🌐", search: "🔎", read: "📄", edit: "✏️", shell: "⌨️", tool: "🔧", think: "💭", status: "●", message: "📻", delegate: "🤝", waiting: "✋",
};

export function timeAgo(from: Date | string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(from).getTime()) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function Feed({ data, now, onlyAgent, onPick }: { data: OpsOverview; now: number; onlyAgent: number | null; onPick: (id: number) => void }) {
  const agents = new Map(data.agents.map((a) => [a.id, a]));
  const events = data.events.filter((e) => onlyAgent == null || e.agentId === onlyAgent).slice(0, 80);
  // What a cloud agent's line ran on: its mission's engine if we know it, else the agent's latest run.
  const ranOn = new Map(data.missions.map((m) => [m.id, parseRanOn(m.ranOn)]));
  const engineOf = (e: (typeof events)[number], a: (typeof data.agents)[number] | undefined) => {
    if (!a?.cloud) return null;
    const r = e.missionId != null ? ranOn.get(e.missionId) : null;
    return r ? { engine: r.engine, model: r.model } : runEngineOf(a.runEngine) ? { engine: runEngineOf(a.runEngine)!, model: a.runModel } : null;
  };

  if (events.length === 0) {
    return (
      <p className="text-sm text-white/50 text-center py-6">
        {onlyAgent != null ? "Nothing from this agent yet." : "Nothing yet. When a connected agent reads a page, searches or edits a file, it shows up here, live."}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {events.map((e) => {
        const a = agents.get(e.agentId);
        const provider = providerOf(a?.provider ?? "other");
        const run = engineOf(e, a);
        const badge = a ? badgeFor({ cloud: a.cloud, provider, engine: a.engine, runEngine: run?.engine ?? null }) : provider;
        return (
          <li key={e.id} className={cn("rounded-lg px-2.5 py-1.5", e.kind === "waiting" ? "bg-rose-500/15 border border-rose-400/30" : "bg-white/[0.04]")}>
            <div className="flex items-center gap-1.5 text-[11px] text-white/55">
              <BadgeIcon badge={badge} className="w-3 h-3" />
              <button onClick={() => onPick(e.agentId)} className="font-semibold text-white/80 hover:underline">{a?.name ?? "Agent"}</button>
              {run && <span className="truncate text-white/40" title={runLabel(run.engine, run.model) ?? undefined}>{runShort(run.engine)}</span>}
              <span className="ml-auto tabular-nums">{timeAgo(e.at, now)}</span>
            </div>
            <p className="mt-0.5 text-xs text-white/90 break-words">
              <span className="mr-1">{KIND_ICON[e.kind] ?? "●"}</span>{e.label}
            </p>
            {e.url && (
              <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#8ea6ff] hover:underline break-all">
                {safeHost(e.url)} <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The radio: every message in the facility, and a box to talk to your crew. */
export function Radio({ data, now, onlyAgent, onSent }: { data: OpsOverview; now: number; onlyAgent: number | null; onSent: () => void }) {
  const names = new Map(data.agents.map((a) => [a.id, a.name]));
  const [to, setTo] = useState<string>(onlyAgent != null ? `a:${onlyAgent}` : "all");
  const [body, setBody] = useState("");
  const [busy, start] = useTransition();
  const list = data.messages.filter((m) => onlyAgent == null || m.fromAgentId === onlyAgent || m.toAgentId === onlyAgent).slice(0, 50);
  const [last, setLast] = useState(onlyAgent);
  if (last !== onlyAgent) { setLast(onlyAgent); setTo(onlyAgent != null ? `a:${onlyAgent}` : "all"); }

  function send(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await sendMessageC(to.startsWith("a:") ? { toAgentId: Number(to.slice(2)), body } : to.startsWith("t:") ? { toTeam: to.slice(2), body } : { body });
        setBody("");
        onSent();
      } catch (err) { toast.error((err as Error).message); }
    });
  }
  const label = (m: OpsOverview["messages"][number]) => {
    if (m.extTo) return `${m.fromAgentId ? names.get(m.fromAgentId) ?? "Agent" : "You"} → ${m.extTo} (linked)`;
    if (m.extFrom) return `${m.extFrom} (linked) → ${m.toAgentId ? names.get(m.toAgentId) ?? "agent" : "your crew"}`;
    const from = m.fromAgentId ? names.get(m.fromAgentId) ?? "Agent" : "You";
    const dest = m.toAgentId ? names.get(m.toAgentId) ?? "agent" : m.toTeam ? TEAMS[m.toTeam as TeamKey]?.label ?? m.toTeam : "everyone";
    return `${from} → ${dest}`;
  };

  return (
    <div className="space-y-2">
      <form onSubmit={send} className="rounded-lg border border-white/10 bg-white/[0.04] p-2 space-y-1.5">
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send to"
          className="w-full rounded-md bg-white/[0.06] border border-white/10 px-2 py-1 text-xs text-white [&>option]:text-black">
          <option value="all">Everyone</option>
          {TEAM_KEYS.map((t) => <option key={t} value={`t:${t}`}>{TEAMS[t].label}</option>)}
          {data.agents.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
        </select>
        <div className="flex gap-1.5">
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Orders, context, a nudge…"
            className="flex-1 rounded-md bg-white/[0.06] border border-white/10 px-2 py-1 text-xs text-white placeholder:text-white/35" />
          <button disabled={busy || !body.trim()} className="h-7 w-7 rounded-md bg-[#6b8afd] text-[#0f1222] inline-flex items-center justify-center disabled:opacity-40" aria-label="Send">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-white/40">Agents read it at their next check-in (cloud agents at their next mission).</p>
      </form>
      {list.length === 0 ? (
        <p className="text-sm text-white/50 text-center py-4 flex flex-col items-center gap-1"><RadioIcon className="w-5 h-5" />Radio silence. Messages between you and the agents, and between agents, show up here.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((m) => (
            <li key={m.id} className={cn("rounded-lg px-2.5 py-1.5", m.extFrom || m.extTo ? "bg-amber-300/10 border border-amber-300/20" : m.fromAgentId ? "bg-violet-400/10" : "bg-[#6b8afd]/10")}>
              <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                <span className="font-semibold text-white/85">{label(m)}</span>
                {!m.readAt && m.fromAgentId == null && !m.extTo && <span className="text-[10px] text-amber-300">unread</span>}
                <span className="ml-auto tabular-nums">{timeAgo(m.at, now)}</span>
              </div>
              <p className="mt-0.5 text-xs text-white/90 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function safeHost(u: string) { try { return new URL(u).host; } catch { return u.slice(0, 40); } }
