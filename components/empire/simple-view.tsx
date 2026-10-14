"use client";

// Simplified empire: the same live data as cards — no 3D. Faster on old
// devices and quicker to scan. Tap a card for the full building card.

import { Cloud, CloudRain, Flame, HardHat, Sun } from "lucide-react";
import { BrandIcon, type Brand } from "@/components/brand-icon";
import { cn } from "@/lib/utils";
import { SkyIcon, skyText } from "@/components/empire/sky-icon";
import type { Building, EmpireState } from "@/lib/client/empire";

const BRAND: Partial<Record<string, Brand>> = {
  radar: "reddit", autopilot: "gmail", outreach: "whatsapp", vault: "stripe", news: "rss", runner: "claude", community: "discord", studio: "unity", youtube: "youtube",
};
const WEATHER = { sun: Sun, clouds: Cloud, rain: CloudRain } as const;

export function SimpleView({ state, buildings, onOpen }: { state: EmpireState | null; buildings: Building[]; onOpen: (id: string) => void }) {
  const w = state?.world;
  const Weather = w ? WEATHER[w.week.kind] : Sun;
  return (
    <div className="absolute inset-0 z-[15] overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-28">
        {w && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
            <Tile label="Level" value={`LV ${state?.level} · ${state?.rank}`} />
            <Tile label="Sky" value={<span className="inline-flex items-center gap-1.5"><SkyIcon kind={w.weather.kind} className="w-4 h-4" />{w.weather.tempC != null ? `${w.weather.tempC}°` : "—"}</span>} sub={skyText(w.weather)} />
            <Tile label="This week" value={<span className="inline-flex items-center gap-1.5"><Weather className="w-4 h-4" />{w.week.kind === "sun" ? "Strong" : w.week.kind === "clouds" ? "Mixed" : "Quiet"}</span>} sub={w.week.why} />
            <Tile label="Streak" value={<span className="inline-flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" />{w.streak} days</span>} />
            <Tile label="Goals" value={`${w.goals.filter((g) => g.done).length}/${w.goals.length} built`} />
          </div>
        )}

        {w && w.goals.length > 0 && (
          <div className="mb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {w.goals.map((g) => (
              <div key={g.id} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-medium flex items-center gap-2 truncate">{g.done ? <span>{g.emoji ?? "🏁"}</span> : <HardHat className="w-4 h-4 text-amber-500" />}{g.title}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", g.done ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${Math.round(g.progress * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {buildings.map((b) => {
            const brand = BRAND[b.id];
            return (
              <button key={b.id} onClick={() => onOpen(b.id)}
                className={cn("text-left rounded-2xl border bg-card p-4 hover:border-foreground/25 hover:-translate-y-0.5 hover:shadow-md transition-all", b.neglected ? "border-amber-500/40" : "border-border")}>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl">{brand ? <BrandIcon name={brand} className="w-5 h-5" /> : b.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{b.label}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full", b.working ? "bg-emerald-500 animate-pulse" : b.active ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                      {b.working ? "Working now" : b.active ? "On" : "Idle"} · LV {b.level}
                    </p>
                  </div>
                </div>
                {b.status && <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{b.status}</p>}
                {b.bubbles.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{b.bubbles.slice(0, 2).map((x) => <span key={x.text} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{x.text}</span>)}</div>}
                {b.stats.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {b.stats.slice(0, 3).map((s) => <div key={s.label} className="rounded-lg bg-muted/50 px-2 py-1.5"><p className="text-sm font-semibold tabular-nums truncate">{s.value}</p><p className="text-[10px] text-muted-foreground truncate">{s.label}</p></div>)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3" title={sub}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-sm truncate">{value}</p>
    </div>
  );
}
