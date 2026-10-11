"use client";

// The empire overview. Mounted once in the dashboard layout the first time
// you open /empire, then kept alive (paused, zero cost) while you visit other
// pages — so coming back is instant. Live data every 45 s; new things that
// need you pop a bubble and a sound.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Clock, Gauge, Moon, RefreshCw, Sun, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEmpireC, type Building, type EmpireState } from "@/lib/client/empire";
import { play, setSfxSettings, sfxSettings } from "@/lib/sfx";
import type { EmpireEngine } from "./engine";

const hud = "font-hud uppercase tracking-wide";
const TONE: Record<string, string> = {
  info: "bg-white text-slate-900 border-slate-200",
  good: "bg-emerald-500 text-white border-emerald-600",
  warn: "bg-amber-400 text-amber-950 border-amber-500",
  urgent: "bg-rose-500 text-white border-rose-600 animate-bounce",
};

export function EmpireHost() {
  const pathname = usePathname();
  const onEmpire = pathname === "/empire";
  const [visited, setVisited] = useState(false);
  if (onEmpire && !visited) setVisited(true);
  if (!visited) return null;
  return (
    <div className={cn("absolute inset-0 z-20", !onEmpire && "hidden")} aria-hidden={!onEmpire}>
      <EmpireScene active={onEmpire} />
    </div>
  );
}

function EmpireScene({ active }: { active: boolean }) {
  const router = useRouter();
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<EmpireEngine | null>(null);
  const [state, setState] = useState<EmpireState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sound, setSound] = useState(() => sfxSettings().on); // client-only component
  const [lite, setLite] = useState(false);
  const [time, setTime] = useState<"live" | "day" | "night">("live");
  const [ago, setAgo] = useState(0);
  const prevBubbles = useRef<Map<string, string>>(new Map());

  // Engine lifecycle (three.js is loaded only when the empire is first opened).
  useEffect(() => {
    let disposed = false;
    import("./engine").then(({ EmpireEngine }) => {
      if (disposed || !mount.current) return;
      const e = new EmpireEngine(mount.current);
      e.onPick = (id) => { play("pop"); setSelected(id); e.focus(id); };
      e.onHover = (id) => { setHovered(id); if (id) play("hover"); };
      engine.current = e;
      setLite(e.getQuality() === "low");
      e.setActive(true);
      if (state) e.setBuildings(state.buildings);
    });
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engine.current?.setActive(active); if (active) play("whoosh"); }, [active]);

  const load = useCallback(async () => {
    try {
      const s = await getEmpireC();
      // A new urgent / good bubble since last time → notify.
      let fresh = false;
      for (const b of s.buildings) {
        const sig = b.bubbles.filter((x) => x.tone === "urgent" || x.tone === "good").map((x) => x.text).join("|");
        const prev = prevBubbles.current.get(b.id);
        if (prev !== undefined && sig && sig !== prev) fresh = true;
        prevBubbles.current.set(b.id, sig);
      }
      if (fresh) play("notify");
      setState(s);
      setAgo(0);
      engine.current?.setBuildings(s.buildings);
    } catch { /* keep the last state */ }
  }, []);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 45_000);
    const tick = setInterval(() => setAgo((a) => a + 5), 5000);
    return () => { clearTimeout(first); clearInterval(t); clearInterval(tick); };
  }, [active, load]);

  const sel = state?.buildings.find((b) => b.id === selected) ?? null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#bfdcf0]">
      <div ref={mount} className="absolute inset-0" />

      {/* Labels + message bubbles, positioned every frame by the engine */}
      <div className="absolute inset-0 pointer-events-none">
        {state?.buildings.map((b) => (
          <div key={b.id} ref={(el) => engine.current?.bindLabel(b.id, el)} className="absolute left-0 top-0 will-change-transform transition-opacity duration-200">
            <div className="flex flex-col items-center gap-1">
              {b.bubbles.map((bb) => (
                <button key={bb.text} onClick={() => { play("pop"); setSelected(b.id); engine.current?.focus(b.id); }}
                  className={cn("pointer-events-auto relative rounded-xl border px-2.5 py-1 text-[11px] font-semibold shadow-lg whitespace-nowrap", TONE[bb.tone])}>
                  {bb.text}
                  <span className={cn("absolute left-1/2 -bottom-1 w-2 h-2 -translate-x-1/2 rotate-45 border-r border-b", TONE[bb.tone].replace("animate-bounce", ""))} />
                </button>
              ))}
              <button onClick={() => { play("pop"); setSelected(b.id); engine.current?.focus(b.id); }}
                className={cn("pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/55 text-white px-2 py-0.5 text-[11px] backdrop-blur-sm transition-transform",
                  (hovered === b.id || selected === b.id) && "scale-110 bg-black/75")}>
                <span>{b.emoji}</span><span className="font-medium">{b.label}</span>
                {b.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Top-left: empire title */}
      <div className="absolute top-4 left-4 rounded-2xl bg-black/55 text-white backdrop-blur-md px-4 py-3 pointer-events-auto">
        <p className={cn("text-xs text-white/60", hud)}>Your empire</p>
        <p className={cn("text-2xl leading-none mt-0.5", hud)}>{state ? `LV ${state.level} · ${state.rank}` : "Loading…"}</p>
        {state && (
          <div className="mt-2 h-1.5 w-44 bg-white/15 overflow-hidden -skew-x-12">
            <div className="h-full bg-teal-400 transition-[width] duration-700" style={{ width: `${state.progress}%` }} />
          </div>
        )}
        <p className="mt-2 text-[11px] text-white/60 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live · updated {ago < 10 ? "just now" : `${ago}s ago`}
          <button onClick={() => { play("tick"); void load(); }} className="ml-1 hover:text-white" aria-label="Refresh"><RefreshCw className="w-3 h-3" /></button>
        </p>
      </div>

      {/* Top-right: sound + quality */}
      <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto" data-no-sfx>
        <div className="flex rounded-xl bg-black/55 backdrop-blur-md p-0.5">
          {([["live", Clock, "Follow your clock"], ["day", Sun, "Daytime"], ["night", Moon, "Night"]] as const).map(([k, Icon, title]) => (
            <button key={k} title={title} onClick={() => { setTime(k); engine.current?.setTimeOfDay(k === "live" ? null : k === "day" ? 12 : 22); play("toggle"); }}
              className={cn("w-9 h-9 rounded-lg flex items-center justify-center", time === k ? "bg-white text-black" : "text-white/80 hover:text-white")}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <button onClick={() => { const on = !sound; setSound(on); setSfxSettings({ ...sfxSettings(), on }); if (on) play("toggle"); }}
          className="w-10 h-10 rounded-xl bg-black/55 text-white backdrop-blur-md flex items-center justify-center" title={sound ? "Mute sounds" : "Sounds on"}>
          {sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button onClick={() => { const next = !lite; setLite(next); engine.current?.setQuality(next ? "low" : "high"); play("toggle"); }}
          className={cn("h-10 px-3 rounded-xl backdrop-blur-md flex items-center gap-1.5 text-xs", lite ? "bg-white text-black" : "bg-black/55 text-white")} title="Lite mode for slower PCs">
          <Gauge className="w-4 h-4" /> {lite ? "Lite" : "High"}
        </button>
      </div>

      {/* Bottom: building dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] overflow-x-auto pointer-events-auto">
        <div className="flex gap-1.5 rounded-2xl bg-black/55 backdrop-blur-md p-1.5">
          {state?.buildings.map((b) => (
            <button key={b.id} onClick={() => { play("pop"); setSelected(b.id); engine.current?.focus(b.id); }}
              className={cn("relative shrink-0 w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-colors", selected === b.id ? "bg-white" : "hover:bg-white/15")} title={b.label}>
              {b.emoji}
              {b.bubbles.some((x) => x.tone === "urgent") && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
            </button>
          ))}
        </div>
      </div>

      {/* Building panel */}
      {sel && <BuildingPanel b={sel} onClose={() => { play("close"); setSelected(null); }} onOpen={() => { play("whoosh"); router.push(sel.route); }} />}
    </div>
  );
}

function BuildingPanel({ b, onClose, onOpen }: { b: Building; onClose: () => void; onOpen: () => void }) {
  return (
    <aside className="absolute top-4 right-4 bottom-24 w-[min(22rem,calc(100%-2rem))] rounded-3xl bg-card/95 backdrop-blur-md border border-border shadow-2xl p-5 flex flex-col pointer-events-auto animate-in slide-in-from-right-4 fade-in-0">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-2xl">{b.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-2xl leading-none", hud)}>{b.label}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", b.active ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40")} />
            {b.active ? "Working" : "Idle"} · building LV {b.level}
          </p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <p className="mt-4 text-sm">{b.status}</p>
      {b.bubbles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.bubbles.map((x) => <span key={x.text} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE[x.tone].replace("animate-bounce", ""))}>{x.text}</span>)}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {b.stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/50 p-3">
            <p className={cn("text-lg leading-none tabular-nums", hud)}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4">
        <Link href={b.route} onClick={(e) => { e.preventDefault(); onOpen(); }}
          className="w-full h-11 rounded-xl bg-foreground text-background font-medium inline-flex items-center justify-center gap-2" data-no-sfx>
          Open {b.label} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </aside>
  );
}
