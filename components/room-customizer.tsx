"use client";

import { useState, useRef, useEffect } from "react";
import { Palette, X, Check, Flame, Leaf, Moon, BookOpen, Mountain } from "lucide-react";
import { useRoomStore, ROOM_THEMES, type RoomTheme, type Decorations } from "@/lib/store/room";

const ROOM_ICONS: Record<RoomTheme, React.ComponentType<{ className?: string }>> = {
  cabin: Flame, bamboo: Leaf, lofi: Moon, nook: BookOpen, mountain: Mountain,
};
import { cn } from "@/lib/utils";

const DECORATION_LABELS: Record<keyof Decorations, string> = {
  candles: "Candles & Lamps",
  window:  "Window",
  plants:  "Plants & Nature",
  artwork: "Artwork & Decor",
  grain:   "Film Grain",
};

export function RoomCustomizer() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, decorations, setTheme, toggleDecoration } = useRoomStore();

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Customize room"
        className={cn(
          "w-full flex items-center gap-3 rounded-xl transition-colors text-sm px-3 py-2",
          open
            ? "bg-[var(--gold-muted)] text-[var(--gold)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <Palette className="w-4 h-4 shrink-0" />
        <span>Room Theme</span>
        {/* Swatch of current theme */}
        <span
          className="ml-auto w-3 h-3 rounded-full shrink-0 ring-1 ring-border"
          style={{ background: ROOM_THEMES[theme].accent }}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Room</p>
              <p className="text-sm font-semibold mt-0.5">Customize your space</p>
            </div>
            <button onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Theme picker */}
          <div className="p-3 space-y-1.5">
            <p className="text-[9px] text-muted-foreground uppercase tracking-[0.18em] px-1 mb-2">Scene</p>
            {(Object.entries(ROOM_THEMES) as [RoomTheme, typeof ROOM_THEMES[RoomTheme]][]).map(([id, info]) => {
              const RoomIcon = ROOM_ICONS[id];
              return (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm",
                  theme === id
                    ? "bg-[var(--gold-muted)] border border-[var(--gold)]/25"
                    : "hover:bg-accent border border-transparent"
                )}
              >
                {/* Icon swatch */}
                <span
                  className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ background: `${info.accent}22`, border: `1px solid ${info.accent}44`, color: info.accent }}
                >
                  <RoomIcon className="w-4 h-4" />
                </span>

                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold text-xs", theme === id ? "text-[var(--gold)]" : "text-foreground")}>
                    {info.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{info.desc}</p>
                </div>

                {theme === id && <Check className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />}
              </button>
              );
            })}
          </div>

          {/* Decoration toggles */}
          <div className="border-t border-border px-3 py-3 space-y-0.5">
            <p className="text-[9px] text-muted-foreground uppercase tracking-[0.18em] px-1 mb-2">Decorations</p>
            {(Object.keys(DECORATION_LABELS) as (keyof Decorations)[]).map((key) => (
              <button
                key={key}
                onClick={() => toggleDecoration(key)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent transition-colors text-xs"
              >
                <span className={decorations[key] ? "text-foreground" : "text-muted-foreground"}>
                  {DECORATION_LABELS[key]}
                </span>
                {/* Toggle pill */}
                <span className={cn(
                  "w-8 h-4 rounded-full transition-colors relative",
                  decorations[key] ? "bg-[var(--gold)]" : "bg-muted border border-border"
                )}>
                  <span className={cn(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all shadow-sm",
                    decorations[key] ? "right-0.5" : "left-0.5"
                  )} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
