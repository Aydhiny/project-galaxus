"use client";

// The empire overview. Mounted once in the dashboard layout the first time
// you open /empire, then kept alive (paused, zero cost) while you visit other
// pages — so coming back is instant. Live data every 45 s; new things that
// need you pop a bubble and a sound.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Clock, Cloud, CloudRain, Gauge, Globe2, HardHat, LocateFixed, Moon, RefreshCw, Sun, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { BrandIcon, type Brand } from "@/components/brand-icon";
import { useMusicStore } from "@/lib/store/music";
import { useSpotifyStore } from "@/lib/client/spotify";
import { setAzanVolume, usePrayerStore } from "@/components/azan-player";
import { addOpportunityTaskC } from "@/lib/client/opportunities";
import { EmpireAudio } from "@/lib/empire-audio";
import { nextVakat } from "@/lib/vaktija";
import { cn } from "@/lib/utils";
import { getEmpireC, type Building, type EmpireState, type GoalSite } from "@/lib/client/empire";
import { play, setSfxSettings, sfxSettings } from "@/lib/sfx";
import type { EmpireEngine } from "./engine";

const hud = "font-hud uppercase tracking-wide";

// Small per-browser memory so each real event animates once and the streak
// lights know what they showed last time. Losing it is harmless.
const store = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const FRESH_MS = 20 * 60_000; // events newer than this play when you open the empire
const WEATHER_ICON = { sun: Sun, clouds: Cloud, rain: CloudRain } as const;

/** Real logos for buildings that run on a known service (emoji for the rest). */
const BRAND: Partial<Record<string, Brand>> = {
  radar: "reddit", autopilot: "gmail", outreach: "whatsapp", vault: "stripe", news: "rss",
  runner: "claude", community: "discord", studio: "unity", youtube: "youtube",
};
function Mark({ id, emoji, className }: { id: string; emoji: string; className?: string }) {
  const brand = BRAND[id];
  return brand ? <BrandIcon name={brand} className={className} /> : <span className="leading-none">{emoji}</span>;
}
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
  const audioRef = useRef<EmpireAudio | null>(null);
  const musicTrack = useMusicStore((s) => s.activeId);
  const spotify = useSpotifyStore((s) => s.now);
  const vaktija = usePrayerStore((s) => s.vaktija);
  const prayerNow = usePrayerStore((s) => s.current);

  // Music sets the mood: Spotify playing -> disco; the built-in calm tracks -> hibernate.
  const mood = spotify?.isPlaying ? "disco" : musicTrack ? "hibernate" : "normal";
  useEffect(() => { engine.current?.setMood(mood); }, [mood]);
  useEffect(() => { engine.current?.setPrayer(!!prayerNow); }, [prayerNow]);

  // Engine lifecycle (three.js is loaded only when the empire is first opened).
  useEffect(() => {
    let disposed = false;
    import("./engine").then(({ EmpireEngine }) => {
      if (disposed || !mount.current) return;
      const e = new EmpireEngine(mount.current);
      e.onPick = (id) => { play("pop"); setSelected(id); e.focus(id); };
      e.onHover = (id) => { setHovered(id); if (id) play("hover"); };
      e.onPickAirship = (id) => {
        play("pop");
        addOpportunityTaskC(id).then(() => {
          e.landAirship(id);
          play("success");
          toast.success("Added to your tasks with its deadline.");
        }).catch((err) => toast.error((err as Error).message));
      };
      e.onSound = (mix) => {
        const a = audioRef.current;
        if (!a) return;
        a.update(mix, { night: e.nightLevel(), raining: e.isRaining() });
        setAzanVolume(a.mosqueLevel());
      };
      engine.current = e;
      e.setMood(useSpotifyStore.getState().now?.isPlaying ? "disco" : useMusicStore.getState().activeId ? "hibernate" : "normal");
      e.setPrayer(!!usePrayerStore.getState().current);
      setLite(e.getQuality() === "low");
      e.setActive(true);
      if (state) { e.setBuildings(state.buildings); applyWorld(e, state); }
    });
    return () => { disposed = true; engine.current?.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engine.current?.setActive(active); if (active) play("whoosh"); }, [active]);

  // District sounds only while you're looking at the empire with sound on.
  useEffect(() => {
    if (!active || !sound) return;
    const a = new EmpireAudio();
    a.start();
    audioRef.current = a;
    return () => { a.stop(); audioRef.current = null; setAzanVolume(null); };
  }, [active, sound]);

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
      if (engine.current) { engine.current.setBuildings(s.buildings); applyWorld(engine.current, s); }
    } catch { /* keep the last state */ }
  }, []);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 45_000);
    const tick = setInterval(() => setAgo((a) => a + 5), 5000);
    return () => { clearTimeout(first); clearInterval(t); clearInterval(tick); };
  }, [active, load]);

  // The mosque shows the next vakat (and "azan" at prayer time).
  const buildings = (state?.buildings ?? []).map((b) => {
    if (b.id !== "mosque" || !vaktija) return b;
    const nv = nextVakat(vaktija);
    return {
      ...b,
      status: prayerNow ? `${prayerNow} — vrijeme je za namaz` : `${nv.bs} u ${nv.time}`,
      bubbles: prayerNow ? [{ text: `🕌 ${prayerNow} — azan`, tone: "good" as const }] : nv.minutesLeft <= 30 ? [{ text: `${nv.bs} za ${nv.minutesLeft} min`, tone: "info" as const }] : [],
      stats: [{ label: "Next", value: `${nv.bs} ${nv.time}` }, ...b.stats],
    };
  });
  const sel = buildings.find((b) => b.id === selected) ?? null;
  const goals = state?.world.goals ?? [];
  const selGoal = selected?.startsWith("goal:") ? goals.find((g) => `goal:${g.id}` === selected) ?? null : null;
  const weather = state?.world.weather;
  const WeatherIcon = weather ? WEATHER_ICON[weather.kind] : Sun;
  // Phones: the panel is a bottom sheet over ~60% of the screen, so lift the city above it.
  const hasSel = !!sel || !!selGoal;
  useEffect(() => {
    const apply = () => engine.current?.setBottomInset(hasSel && window.innerWidth < 640 ? 0.6 : 0);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [hasSel]);
  const close = () => { play("close"); setSelected(null); engine.current?.unfocus(); };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#bfdcf0]">
      <div ref={mount} className="absolute inset-0" />

      {/* Labels + message bubbles, positioned every frame by the engine */}
      {/* isolate: label z-indexes stay inside this layer, under the panel and HUD */}
      <div className="absolute inset-0 pointer-events-none z-10 isolate">
        {goals.map((g) => (
          <div key={`goal:${g.id}`} ref={(el) => engine.current?.bindLabel(`goal:${g.id}`, el)} className="absolute left-0 top-0 will-change-transform transition-opacity duration-200">
            <button onClick={() => { play("pop"); setSelected(`goal:${g.id}`); engine.current?.focus(`goal:${g.id}`); }}
              className={cn("pointer-events-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-lg backdrop-blur-sm",
                g.done ? "bg-emerald-500 text-white" : "bg-amber-400 text-amber-950")}>
              {g.done ? <span>{g.emoji ?? "🏁"}</span> : <HardHat className="w-3 h-3" />}
              <span className={cn(selected === `goal:${g.id}` ? "inline" : "hidden md:inline", "max-w-36 truncate")}>{g.title}</span>
              <span className="tabular-nums opacity-80">{g.done ? "done" : `${Math.round(g.progress * 100)}%`}</span>
            </button>
          </div>
        ))}
        {buildings.map((b) => (
          <div key={b.id} ref={(el) => engine.current?.bindLabel(b.id, el)} className="absolute left-0 top-0 will-change-transform transition-opacity duration-200">
            <div className="flex flex-col items-center gap-1">
              {b.bubbles.map((bb, bi) => (
                // Phones show only the most important bubble per building.
                <span key={bb.text} className={cn(bi > 0 && "hidden sm:block")}>
                <button key={bb.text} onClick={() => { play("pop"); setSelected(b.id); engine.current?.focus(b.id); }}
                  className={cn("pointer-events-auto relative rounded-xl border px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-semibold shadow-lg whitespace-nowrap", TONE[bb.tone])}>
                  {bb.text}
                  <span className={cn("absolute left-1/2 -bottom-1 w-2 h-2 -translate-x-1/2 rotate-45 border-r border-b", TONE[bb.tone].replace("animate-bounce", ""))} />
                </button>
                </span>
              ))}
              <button onClick={() => { play("pop"); setSelected(b.id); engine.current?.focus(b.id); }}
                aria-label={b.label}
                className={cn("pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/55 text-white px-1.5 sm:px-2 py-0.5 text-[11px] backdrop-blur-sm transition-transform",
                  (hovered === b.id || selected === b.id) && "scale-110 bg-black/75")}>
                <Mark id={b.id} emoji={b.emoji} className="w-3.5 h-3.5" /><span className={cn("font-medium", selected === b.id ? "inline" : "hidden md:inline")}>{b.label}</span>
                {b.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Top-left: empire title */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 max-w-[calc(100%-4.5rem)] sm:max-w-none rounded-2xl bg-black/55 text-white backdrop-blur-md px-3 py-2 sm:px-4 sm:py-3 pointer-events-auto">
        <p className={cn("text-xs text-white/60", hud)}>Your empire</p>
        <p className={cn("text-lg sm:text-2xl leading-none mt-0.5 truncate", hud)}>{state ? `LV ${state.level} · ${state.rank}` : "Loading…"}</p>
        {state && (
          <div className="mt-2 h-1.5 w-28 sm:w-44 bg-white/15 overflow-hidden -skew-x-12">
            <div className="h-full bg-teal-400 transition-[width] duration-700" style={{ width: `${state.progress}%` }} />
          </div>
        )}
        <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-[11px] text-white/60 flex flex-wrap items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live · updated {ago < 10 ? "just now" : `${ago}s ago`}
          {mood !== "normal" && <span className="ml-1 rounded-full bg-white/15 px-1.5">{mood === "disco" ? "🪩 disco" : "💤 hibernate"}</span>}
          {weather && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5" title={weather.why}><WeatherIcon className="w-3 h-3" />{weather.kind === "sun" ? "sunny week" : weather.kind === "clouds" ? "cloudy week" : "rainy week"}</span>}
          <button onClick={() => { play("tick"); void load(); }} className="ml-1 hover:text-white" aria-label="Refresh"><RefreshCw className="w-3 h-3" /></button>
        </p>
      </div>

      {/* Top-right: sound + quality */}
      <div className={cn("absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col sm:flex-row items-end gap-1.5 sm:gap-2 pointer-events-auto", hasSel && "hidden")} data-no-sfx>
        <Link href="/empire/world" title="Visit other empires · monthly contest" onClick={() => play("whoosh")}
          className="w-10 h-10 rounded-xl bg-black/55 text-white backdrop-blur-md flex items-center justify-center"><Globe2 className="w-4 h-4" /></Link>
        <button onClick={() => { engine.current?.resetView(); play("whoosh"); }} title="Reset view"
          className="w-10 h-10 rounded-xl bg-black/55 text-white backdrop-blur-md flex items-center justify-center"><LocateFixed className="w-4 h-4" /></button>
        <div className="flex flex-col sm:flex-row rounded-xl bg-black/55 backdrop-blur-md p-0.5">
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
          className={cn("h-10 w-10 sm:w-auto sm:px-3 rounded-xl backdrop-blur-md flex items-center justify-center gap-1.5 text-xs", lite ? "bg-white text-black" : "bg-black/55 text-white")} title="Lite mode for slower PCs">
          <Gauge className="w-4 h-4" /> <span className="hidden sm:inline">{lite ? "Lite" : "High"}</span>
        </button>
      </div>

      {/* Bottom: building dock */}
      <div className={cn("absolute left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1.5rem)] overflow-x-auto overscroll-x-contain rounded-2xl pointer-events-auto [scrollbar-width:none]", hasSel && "hidden sm:block")}
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="flex gap-1 sm:gap-1.5 w-max rounded-2xl bg-black/55 backdrop-blur-md p-1 sm:p-1.5">
          {buildings.map((b) => (
            <button key={b.id} onClick={() => { play("pop"); setSelected(b.id); engine.current?.focus(b.id); }}
              className={cn("relative shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-lg sm:text-xl flex items-center justify-center transition-colors", selected === b.id ? "bg-white" : "hover:bg-white/15")} title={b.label}>
              <Mark id={b.id} emoji={b.emoji} className="w-5 h-5" />
              {b.bubbles.some((x) => x.tone === "urgent") && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
            </button>
          ))}
        </div>
      </div>

      {/* Building panel */}
      {sel && <BuildingPanel b={sel} onClose={close} onOpen={() => { play("whoosh"); router.push(sel.route); }} />}
      {selGoal && <GoalPanel g={selGoal} onClose={close} onOpen={() => { play("whoosh"); router.push("/tasks"); }} />}
    </div>
  );
}

/** Push the living-city data into the engine and play each new real event once. */
function applyWorld(e: EmpireEngine, s: EmpireState) {
  const w = s.world;
  const prevStreak = store.get<number | null>("empire-streak", null);
  const completed = e.setWorld(w, prevStreak);
  store.set("empire-streak", w.streak);
  if (prevStreak != null && w.streak < prevStreak) play("error");

  // Fireworks: once per goal, ever (per browser).
  const celebrated = new Set(store.get<number[]>("empire-celebrated", []));
  const toCelebrate = [...new Set([...completed, ...w.goals.filter((g) => g.done).map((g) => g.id)])].filter((id) => !celebrated.has(id));
  toCelebrate.forEach((id, i) => setTimeout(() => { e.fireworksAtGoal(id); play("levelup"); }, 800 + i * 1500));
  store.set("empire-celebrated", [...celebrated, ...toCelebrate].slice(-100));

  // Trucks, pings and beams for events you haven't seen yet.
  const seen = new Set(store.get<string[]>("empire-seen", []));
  const now = Date.now();
  const fresh = w.events.filter((ev) => !seen.has(ev.id) && now - new Date(ev.at).getTime() < FRESH_MS);
  fresh.forEach((ev, i) => setTimeout(() => {
    e.event(ev, () => play("coin"));
    play(ev.type === "reply" ? "notify" : ev.type === "money" ? "whoosh" : ev.type === "hotgig" ? "pop" : "tick");
  }, 600 + i * 1400));
  for (const ev of w.events) seen.add(ev.id);
  store.set("empire-seen", [...seen].slice(-300));
}

function GoalPanel({ g, onClose, onOpen }: { g: GoalSite; onClose: () => void; onOpen: () => void }) {
  const pct = Math.round(g.progress * 100);
  return (
    <aside className="absolute z-30 inset-x-0 bottom-0 max-h-[62%] rounded-t-3xl sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-auto sm:max-h-none sm:w-[min(22rem,calc(100%-2rem))] sm:rounded-3xl bg-card border border-border shadow-2xl p-4 sm:p-5 flex flex-col overflow-y-auto pointer-events-auto animate-in slide-in-from-bottom-6 sm:slide-in-from-right-4 fade-in-0"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <span className="sm:hidden mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
      <div className="flex items-start gap-3">
        <span className={cn("w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-2xl", g.done ? "bg-emerald-500/15" : "bg-amber-400/20")}>
          {g.done ? g.emoji ?? "🏁" : <HardHat className="w-5 h-5 text-amber-600" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xl leading-tight", hud)}>{g.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{g.done ? "Built — goal complete" : "Under construction · this month's goal"}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Tasks done</span><span className="font-semibold tabular-nums">{pct}%</span></div>
        <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full transition-all", g.done ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 text-xs text-muted-foreground">Every task you finish for this goal raises the building. All done → it opens with fireworks.</p>
      </div>
      <button onClick={onOpen} className="mt-4 w-full h-11 rounded-xl bg-foreground text-background font-medium inline-flex items-center justify-center gap-2" data-no-sfx>
        Open tasks <ArrowRight className="w-4 h-4" />
      </button>
    </aside>
  );
}

function BuildingPanel({ b, onClose, onOpen }: { b: Building; onClose: () => void; onOpen: () => void }) {
  return (
    <aside className="absolute z-30 inset-x-0 bottom-0 max-h-[62%] rounded-t-3xl sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-24 sm:max-h-none sm:w-[min(22rem,calc(100%-2rem))] sm:rounded-3xl bg-card border border-border shadow-2xl p-4 sm:p-5 flex flex-col overflow-y-auto overscroll-contain pointer-events-auto animate-in slide-in-from-bottom-6 sm:slide-in-from-right-4 fade-in-0"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <span className="sm:hidden mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-muted flex items-center justify-center text-2xl"><Mark id={b.id} emoji={b.emoji} className="w-6 h-6" /></span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xl sm:text-2xl leading-none truncate", hud)}>{b.label}</p>
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
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 gap-2">
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
