"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCommandStore } from "@/lib/store/command";
import { useAmbientStore } from "@/lib/store/ambient";
import { useRoomStore, type RoomTheme } from "@/lib/store/room";
import { cn } from "@/lib/utils";
import {
  Home, CheckSquare, BookOpen, GraduationCap, Dumbbell, Moon, Music2, NotebookPen,
  Target, HeartPulse, Sparkles, Activity, BarChart3, BookMarked, StickyNote,
  LayoutDashboard, CloudRain, Flame, Wind, Timer, Plus, Sunrise, Search, X,
  Leaf, Mountain,
} from "lucide-react";

/* ─── Command definitions ──────────────────────────────────────────────────── */

type CmdKind = "navigate" | "action" | "room" | "sound";

interface Cmd {
  id: string;
  label: string;
  subtitle?: string;
  kind: CmdKind;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
}

const KIND_LABEL: Record<CmdKind, string> = {
  navigate: "Go to",
  action:   "Action",
  room:     "Room",
  sound:    "Sound",
};

const KIND_COLOR: Record<CmdKind, string> = {
  navigate: "oklch(0.76 0.17 50)",
  action:   "oklch(0.70 0.20 285)",
  room:     "oklch(0.70 0.15 155)",
  sound:    "oklch(0.72 0.18 220)",
};

/* fuzzy: every character in query appears in text in order */
function fuzzy(q: string, text: string): boolean {
  if (!q) return true;
  let qi = 0;
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  for (let i = 0; i < tl.length && qi < ql.length; i++) {
    if (tl[i] === ql[qi]) qi++;
  }
  return qi === ql.length;
}

export function CommandPalette() {
  const { paletteOpen, closePalette, openCapture } = useCommandStore();
  const { rainVol, fireVol, brownVol, setRainVol, setFireVol, setBrownVol } = useAmbientStore();
  const { setTheme } = useRoomStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* Sounds toggle helpers */
  const toggleRain  = useCallback(() => setRainVol(rainVol   > 0 ? 0 : 60), [rainVol,  setRainVol]);
  const toggleFire  = useCallback(() => setFireVol(fireVol   > 0 ? 0 : 60), [fireVol,  setFireVol]);
  const toggleBrown = useCallback(() => setBrownVol(brownVol > 0 ? 0 : 60), [brownVol, setBrownVol]);

  const nav = (href: string) => { router.push(href); closePalette(); };

  const COMMANDS: Cmd[] = [
    // Navigate
    { id:"dash",     kind:"navigate", label:"Dashboard",      icon:<Home className="w-4 h-4"/>,           run:()=>nav("/dashboard")  },
    { id:"overview", kind:"navigate", label:"Daily Overview", icon:<Sunrise className="w-4 h-4"/>,        run:()=>nav("/overview"),  keywords:"morning evening ritual" },
    { id:"daily",    kind:"navigate", label:"Daily Check-in", icon:<CheckSquare className="w-4 h-4"/>,   run:()=>nav("/daily")      },
    { id:"goals",    kind:"navigate", label:"Goals",          icon:<Target className="w-4 h-4"/>,         run:()=>nav("/goals")      },
    { id:"review",   kind:"navigate", label:"Weekly Review",  icon:<BarChart3 className="w-4 h-4"/>,     run:()=>nav("/review")     },
    { id:"training", kind:"navigate", label:"Training",       icon:<Dumbbell className="w-4 h-4"/>,      run:()=>nav("/training")   },
    { id:"workout",  kind:"navigate", label:"Home Workout",   icon:<HeartPulse className="w-4 h-4"/>,   run:()=>nav("/workout")    },
    { id:"meditate", kind:"navigate", label:"Meditation",     icon:<Sparkles className="w-4 h-4"/>,      run:()=>nav("/meditation") },
    { id:"metrics",  kind:"navigate", label:"Body Metrics",   icon:<Activity className="w-4 h-4"/>,      run:()=>nav("/metrics")    },
    { id:"study",    kind:"navigate", label:"Study",          icon:<GraduationCap className="w-4 h-4"/>, run:()=>nav("/study"),     keywords:"courses learn" },
    { id:"reading",  kind:"navigate", label:"Reading",        icon:<BookOpen className="w-4 h-4"/>,      run:()=>nav("/reading"),   keywords:"books library" },
    { id:"notes",    kind:"navigate", label:"Notes",          icon:<StickyNote className="w-4 h-4"/>,    run:()=>nav("/notes"),     keywords:"brain dump write" },
    { id:"heatmap",  kind:"navigate", label:"Habit Map",      icon:<LayoutDashboard className="w-4 h-4"/>, run:()=>nav("/heatmap") },
    { id:"spiritual",kind:"navigate", label:"Spiritual",      icon:<Moon className="w-4 h-4"/>,           run:()=>nav("/spiritual"), keywords:"prayers islam" },
    { id:"duas",     kind:"navigate", label:"Duas & Dhikr",   icon:<BookMarked className="w-4 h-4"/>,    run:()=>nav("/duas")       },
    { id:"creative", kind:"navigate", label:"Creative",       icon:<Music2 className="w-4 h-4"/>,        run:()=>nav("/creative"),  keywords:"music beats producer" },
    { id:"journal",  kind:"navigate", label:"Journal",        icon:<NotebookPen className="w-4 h-4"/>,   run:()=>nav("/journal")    },
    // Actions
    { id:"capture",  kind:"action",   label:"Quick Capture",  subtitle:"Brain-dump to Notes",
      icon:<Plus className="w-4 h-4"/>, run:()=>{ closePalette(); setTimeout(openCapture, 80); }, keywords:"note idea brain dump" },
    { id:"pomodoro", kind:"action",   label:"Start Pomodoro", subtitle:"25-minute focus session",
      icon:<Timer className="w-4 h-4"/>, run:()=>nav("/study"), keywords:"focus timer work" },
    // Room themes
    { id:"cabin",    kind:"room", label:"Cozy Cabin",    icon:<Flame className="w-4 h-4"/>,    run:()=>{ setTheme("cabin");    closePalette(); } },
    { id:"bamboo",   kind:"room", label:"Bamboo Zen",    icon:<Leaf className="w-4 h-4"/>,     run:()=>{ setTheme("bamboo");   closePalette(); } },
    { id:"lofi",     kind:"room", label:"Lofi Night",    icon:<Moon className="w-4 h-4"/>,     run:()=>{ setTheme("lofi");     closePalette(); } },
    { id:"nook",     kind:"room", label:"Reading Nook",  icon:<BookOpen className="w-4 h-4"/>, run:()=>{ setTheme("nook");     closePalette(); } },
    { id:"mountain", kind:"room", label:"Mountain Hut",  icon:<Mountain className="w-4 h-4"/>, run:()=>{ setTheme("mountain"); closePalette(); } },
    // Sounds
    { id:"rain",   kind:"sound", label: rainVol  > 0 ? "Turn off Rain"        : "Turn on Rain",
      icon:<CloudRain className="w-4 h-4"/>, run:()=>{ toggleRain();  closePalette(); } },
    { id:"fire",   kind:"sound", label: fireVol  > 0 ? "Turn off Fire"        : "Turn on Fire",
      icon:<Flame className="w-4 h-4"/>,     run:()=>{ toggleFire();  closePalette(); } },
    { id:"brown",  kind:"sound", label: brownVol > 0 ? "Turn off Brown Noise" : "Turn on Brown Noise",
      icon:<Wind className="w-4 h-4"/>,      run:()=>{ toggleBrown(); closePalette(); } },
  ];

  const filtered = COMMANDS.filter(c =>
    fuzzy(query, c.label + " " + (c.subtitle ?? "") + " " + (c.keywords ?? ""))
  );

  /* Group by kind, preserving order */
  const groups: { kind: CmdKind; items: Cmd[] }[] = [];
  const seen = new Set<CmdKind>();
  for (const cmd of filtered) {
    if (!seen.has(cmd.kind)) { seen.add(cmd.kind); groups.push({ kind: cmd.kind, items: [] }); }
    groups.at(-1)!.items.push(cmd);
  }

  /* flat index for keyboard nav */
  const flat = filtered;

  useEffect(() => { if (paletteOpen) { setQuery(""); setSelected(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [paletteOpen]);
  useEffect(() => { setSelected(0); }, [query]);

  /* Scroll selected into view */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  /* Global hotkey: Cmd/Ctrl+K */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); paletteOpen ? closePalette() : useCommandStore.getState().openPalette(); }
      if (e.key === "Escape" && paletteOpen) closePalette();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [paletteOpen, closePalette]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter"  && flat[selected]) flat[selected].run();
    if (e.key === "Escape") closePalette();
  }

  if (!paletteOpen) return null;

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={closePalette}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 24px 80px oklch(0 0 0 / 55%), 0 0 0 1px oklch(1 0 0 / 6%)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, actions, rooms…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 text-[10px] text-muted-foreground font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            groups.map(({ kind, items }) => (
              <div key={kind} className="mb-1">
                <p className="px-4 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  {KIND_LABEL[kind]}
                </p>
                {items.map(cmd => {
                  const idx = flatIdx++;
                  const isActive = idx === selected;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={idx}
                      onClick={cmd.run}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${KIND_COLOR[kind]}18`, color: KIND_COLOR[kind] }}>
                        {cmd.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{cmd.label}</p>
                        {cmd.subtitle && <p className="text-[11px] text-muted-foreground">{cmd.subtitle}</p>}
                      </div>
                      {isActive && (
                        <kbd className="shrink-0 h-5 flex items-center px-1.5 rounded border border-border bg-muted text-[10px] text-muted-foreground font-mono">↵</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono">↵</kbd> select</span>
          </span>
          <span>{flat.length} result{flat.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
