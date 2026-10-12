"use client";

// Make the city yours: palette, ground and flag colour (plus its name).
// Previews live while you pick; Save stores it, and visitors see it too.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Paintbrush, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLAG_COLORS, GROUNDS, PALETTES, type EmpireStyle, type GroundKey, type PaletteKey } from "@/lib/empire-world";
import { saveEmpireStyleC } from "@/lib/client/empire";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function CustomizePanel({ value, onPreview, onClose }: { value: EmpireStyle; onPreview: (s: EmpireStyle) => void; onClose: (saved: EmpireStyle | null) => void }) {
  const [style, setStyle] = useState(value);
  const [busy, start] = useTransition();
  const pick = (patch: Partial<EmpireStyle>) => { const next = { ...style, ...patch }; setStyle(next); onPreview(next); };

  return (
    <aside className="absolute z-30 inset-x-0 bottom-0 max-h-[75%] rounded-t-3xl sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-auto sm:max-h-[calc(100%-2rem)] sm:w-[min(24rem,calc(100%-2rem))] sm:rounded-3xl bg-card border border-border shadow-2xl p-5 overflow-y-auto pointer-events-auto animate-in slide-in-from-bottom-6 sm:slide-in-from-right-4 fade-in-0">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center"><Paintbrush className="w-5 h-5" /></span>
        <div className="flex-1">
          <p className="font-hud uppercase tracking-wide text-xl leading-none">Customize your city</p>
          <p className="text-xs text-muted-foreground mt-1">Previewing live. Visitors see your style too.</p>
        </div>
        <button onClick={() => { onPreview(value); onClose(null); }} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Palette</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PALETTES) as PaletteKey[]).map((k) => {
          const p = PALETTES[k];
          return (
            <button key={k} onClick={() => pick({ palette: k })}
              className={cn("rounded-xl border p-2.5 text-left flex items-center gap-2.5 transition-colors", style.palette === k ? "border-foreground bg-muted" : "border-border hover:bg-muted/60")}>
              <span className="flex -space-x-1">
                <span className="w-5 h-5 rounded-full ring-2 ring-card" style={{ background: p.amount ? hex(p.tint) : "#e9e4da" }} />
                <span className="w-5 h-5 rounded-full ring-2 ring-card" style={{ background: hex(p.accent) }} />
              </span>
              <span className="text-sm font-medium flex-1">{p.label}</span>
              {style.palette === k && <Check className="w-4 h-4" />}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ground</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(GROUNDS) as GroundKey[]).map((k) => (
          <button key={k} onClick={() => pick({ ground: k })}
            className={cn("rounded-xl border p-2.5 text-left flex items-center gap-2.5", style.ground === k ? "border-foreground bg-muted" : "border-border hover:bg-muted/60")}>
            <span className="w-8 h-5 rounded-md" style={{ background: `linear-gradient(90deg, ${hex(GROUNDS[k].inner)}, ${hex(GROUNDS[k].outer)})` }} />
            <span className="text-sm font-medium">{GROUNDS[k].label}</span>
          </button>
        ))}
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Flag on your HQ</p>
      <div className="flex flex-wrap gap-2">
        {FLAG_COLORS.map((c) => (
          <button key={c} onClick={() => pick({ flag: c })} aria-label={`Flag ${c}`}
            className={cn("w-9 h-9 rounded-full border-2 transition-transform", style.flag === c ? "border-foreground scale-110" : "border-border")} style={{ background: c }} />
        ))}
      </div>

      <button disabled={busy} onClick={() => start(async () => {
        try { const saved = await saveEmpireStyleC(style); toast.success("Your city's new look is saved."); onClose(saved); }
        catch (e) { toast.error((e as Error).message); }
      })} className="mt-6 w-full h-11 rounded-xl bg-foreground text-background font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save style
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground text-center">City name and sharing live on the World page.</p>
    </aside>
  );
}
