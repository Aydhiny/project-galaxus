"use client";

import { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ["⌘", "K"],      description: "Open command palette",       category: "Navigation" },
  { keys: ["?"],            description: "Show this cheatsheet",       category: "Navigation" },
  { keys: ["Esc"],          description: "Close any overlay",          category: "Navigation" },
  // Capture
  { keys: ["`"],            description: "Quick capture (brain dump)", category: "Capture" },
  { keys: ["⌘", "Enter"],   description: "Save quick capture",         category: "Capture" },
  // Pomodoro
  { keys: ["Alt", "P"],     description: "Play / pause Pomodoro",      category: "Pomodoro" },
  // Ambient
  { keys: ["⌘", "K", "→", "Rain"],    description: "Toggle rain sound",   category: "Ambient" },
  { keys: ["⌘", "K", "→", "Fire"],    description: "Toggle fire sound",   category: "Ambient" },
  { keys: ["⌘", "K", "→", "Brown"],   description: "Toggle brown noise",  category: "Ambient" },
  // Rooms
  { keys: ["⌘", "K", "→", "room"],    description: "Switch room theme",   category: "Room" },
];

const CATEGORIES = [...new Set(SHORTCUTS.map(s => s.category))];

export function ShortcutCheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?") { e.preventDefault(); setOpen(o => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 24px 80px oklch(0 0 0 / 55%)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--gold-muted)] flex items-center justify-center">
              <Keyboard className="w-3.5 h-3.5 text-[var(--gold)]" />
            </div>
            <div>
              <p className="text-sm font-semibold">Keyboard Shortcuts</p>
              <p className="text-[10px] text-muted-foreground">Press <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[9px] font-mono">?</kbd> to toggle</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts by category */}
        <div className="max-h-[460px] overflow-y-auto p-4 space-y-5">
          {CATEGORIES.map(cat => (
            <div key={cat}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">{cat}</p>
              <div className="space-y-1">
                {SHORTCUTS.filter(s => s.category === cat).map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors">
                    <span className="text-sm text-foreground/80">{s.description}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, ki) => (
                        <span key={ki}>
                          {k === "→" ? (
                            <span className="text-muted-foreground/40 text-xs mx-0.5">then</span>
                          ) : (
                            <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground">
                              {k}
                            </kbd>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border text-center">
          <p className="text-[10px] text-muted-foreground/50">Click outside or press Esc to close</p>
        </div>
      </div>
    </div>
  );
}
