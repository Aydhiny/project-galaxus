"use client";

// Replay of a day in 3D. Loads one day (getReplayDay), rebuilds the floor at the
// scrubber's time with the pure rules in lib/ops-replay.ts, and drives the same
// engine the live view uses: presence and activity on every desk, missions moving
// across the board, radio hand-offs flying while it plays. While it's open, the
// page stops feeding live data to the scene (ops-view.tsx). It never touches the
// camera: the view stays wherever you put it.

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { providerOf, roleOf } from "@/lib/ops";
import { agentsAt, hhmmAt, messagesBetween, missionsAt, replayDays, replayMarks, type ReplayDay } from "@/lib/ops-replay";
import type { AgentView, OpsEngine } from "@/components/ops/ops-engine";
import { getReplayDayC, type OpsOverview } from "@/lib/client/ops";

const SPEEDS = [10, 60, 600] as const;
const FLY_GAP_MS = 10 * 60_000; // a bigger jump is a scrub, not playback: nothing flies

export function Replay({ data, engine, top, onExit }: { data: OpsOverview; engine: RefObject<OpsEngine | null>; top: number; onExit: () => void }) {
  const days = useMemo(() => replayDays(data.now, data.tz), [data.now, data.tz]);
  const [day, setDay] = useState(days[0]);
  const [loaded, setLoaded] = useState<ReplayDay | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(60);
  const tRef = useRef(0);
  const shown = useRef<number | null>(null); // the time last drawn, for what flies in between
  const seek = (v: number) => { tRef.current = v; setT(v); };

  const replay = loaded?.day === day ? loaded : null;
  const start = replay ? Math.max(replay.from, Math.min(replay.to, (replay.events[0]?.at ?? replay.from) - 60_000)) : 0;

  useEffect(() => {
    let dead = false;
    getReplayDayC(day).then((r) => {
      if (dead) return;
      const first = Math.max(r.from, Math.min(r.to, (r.events[0]?.at ?? r.from) - 60_000));
      shown.current = null;
      tRef.current = first;
      setT(first);
      setLoaded(r);
      setFailed(null);
      if (r.capped) toast.message("A busy day: the replay shows its first part.");
    }).catch((e) => { if (!dead) setFailed((e as Error).message); });
    return () => { dead = true; };
  }, [day]);

  // Play: advance the clock every frame (state is only set from the frame callback).
  useEffect(() => {
    if (!playing || !replay) return;
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const next = Math.min(replay.to, tRef.current + (now - last) * speed);
      last = now;
      tRef.current = next;
      setT(next);
      if (next >= replay.to) { setPlaying(false); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, replay]);

  // Leave with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // Draw the floor as it was at t. Agents are today's crew (an agent you removed took its history with it).
  const crew = useMemo(() => data.agents.map((a) => ({ id: a.id, name: a.name, role: roleOf(a.role), provider: providerOf(a.provider), cloud: a.cloud, level: data.scores[a.id]?.level ?? 1 })), [data.agents, data.scores]);
  const partners = useMemo(() => data.links.filter((l) => l.status === "active").map((l) => l.partner), [data.links]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !replay) return;
    const state = agentsAt(replay, crew, t);
    const agents: AgentView[] = crew.map((a) => {
      const s = state.get(a.id)!;
      return { ...a, presence: s.presence, statusNote: s.statusNote, activity: s.activity, activityKind: s.activityKind, activityUrl: s.activityUrl, deskNote: null };
    });
    e.setState(agents, missionsAt(replay, t), {
      messages: [], links: [], partners, shift: `Replay · ${replay.day}`, shiftOn: false, standupAt: null,
      boardTitle: `MISSION BOARD // REPLAY ${replay.day} ${hhmmAt(t, data.tz)}`,
    });
    // Radio hand-offs fly while it plays forward; a scrub (or going back) fires nothing.
    const prev = shown.current;
    if (playing && prev != null && t > prev && t - prev < FLY_GAP_MS) {
      const fresh = messagesBetween(replay.messages, prev, t);
      if (fresh.length) e.replayRadio(fresh, agents);
    }
    shown.current = t;
  }, [engine, replay, crew, partners, t, playing, data.tz]);

  const marks = useMemo(() => (replay ? replayMarks(replay) : []), [replay]);
  const names = useMemo(() => new Map(data.agents.map((a) => [a.id, a.name])), [data.agents]);
  const recent = useMemo(() => {
    if (!replay) return [];
    const out: ReplayDay["events"] = [];
    for (let i = replay.events.length - 1; i >= 0 && out.length < 3; i--) if (replay.events[i].at <= t) out.push(replay.events[i]);
    return out;
  }, [replay, t]);

  const pill = "pointer-events-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-sm text-white";
  return (
    <>
      {/* What you're looking at, unmissable. */}
      <div className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 flex items-center gap-2" style={{ top }}>
        <span className={cn(pill, "font-hud uppercase tracking-wider text-[13px] border-[#6b8afd]/60")}>
          <span className="w-2 h-2 rounded-full bg-[#6b8afd] animate-pulse" />
          Replay · {replay ? hhmmAt(t, data.tz) : "…"}
        </span>
        <button onClick={onExit} className={cn(pill, "hover:bg-white/10")}><X className="w-4 h-4" /> Exit</button>
      </div>

      {/* The timeline */}
      <div className="absolute z-20 bottom-3 left-1/2 -translate-x-1/2 w-[min(44rem,calc(100%-1.5rem))] rounded-2xl bg-[#26272b]/94 backdrop-blur-md border border-white/12 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button disabled={!replay} onClick={() => { if (replay && tRef.current >= replay.to) seek(start); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"}
            className="h-8 w-8 rounded-lg bg-[#6b8afd] text-[#0f1222] inline-flex items-center justify-center disabled:opacity-40">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cn("h-7 px-2 rounded-md text-xs font-mono", speed === s ? "bg-white text-black" : "text-white/70 hover:text-white")}>×{s}</button>
            ))}
          </div>
          <select value={day} onChange={(e) => { setPlaying(false); setDay(e.target.value); }} aria-label="Day"
            className="h-8 rounded-lg bg-white/[0.06] border border-white/10 px-2 text-xs text-white">
            {days.map((d, i) => <option key={d} value={d} className="bg-[#26272b]">{i === 0 ? `Today · ${d}` : i === 1 ? `Yesterday · ${d}` : d}</option>)}
          </select>
          <span className="ml-auto text-xs font-mono text-white/60">
            {replay ? <>{hhmmAt(t, data.tz)} <span className="text-white/35">/ {hhmmAt(replay.to, data.tz)}</span></> : failed ? null : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          </span>
        </div>

        {failed && !replay && <p className="mt-2 text-xs text-rose-300">{failed}</p>}
        {replay && (
          <>
            <div className="relative mt-2.5">
              {/* Errors (orange) and agents waiting for you (rose), so you can jump straight to trouble. */}
              <div className="pointer-events-none absolute inset-x-0 -top-1 h-2">
                {marks.map((m) => <span key={m.id} className={cn("absolute top-0 w-0.5 h-2 rounded", m.kind === "error" ? "bg-orange-400" : "bg-rose-400")} style={{ left: `${m.pct}%` }} />)}
              </div>
              <input type="range" min={replay.from} max={replay.to} step={30_000} value={Math.max(replay.from, Math.min(replay.to, t))}
                onChange={(e) => seek(Number(e.target.value))} aria-label="Time of day"
                className="w-full accent-[#6b8afd]" />
            </div>
            <div className="mt-1.5 space-y-0.5 min-h-[3.25rem]">
              {recent.length === 0 && <p className="text-[11px] text-white/45">{replay.events.length ? "Nothing yet at this time. Press play." : "Nothing happened on the floor this day."}</p>}
              {recent.map((e) => (
                <p key={e.id} className="text-[11px] text-white/70 truncate">
                  <span className="font-mono text-white/40">{hhmmAt(e.at, data.tz)}</span> <b className="text-white/85">{names.get(e.agentId) ?? "an agent"}</b> · {e.label}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
