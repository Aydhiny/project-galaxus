"use client";

// The player screen — GTA-style stats page: who you are, your level and
// rank, and a bar for every skill, all computed from what you've actually done.

import { Coins, Flame, Handshake, Lock, Sparkles, Vault } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANKS } from "@/lib/hud";
import type { Hud } from "@/lib/client/hud";

const hud = "font-hud uppercase tracking-wide";
const fmt = (n: number) => n.toLocaleString("en-US");

const TONE: Record<string, { bar: string; chip: string }> = {
  amber: { bar: "bg-amber-400", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  emerald: { bar: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  sky: { bar: "bg-sky-400", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  rose: { bar: "bg-rose-400", chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  violet: { bar: "bg-violet-400", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  orange: { bar: "bg-orange-400", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300" },
  teal: { bar: "bg-teal-400", chip: "bg-teal-500/15 text-teal-600 dark:text-teal-300" },
  indigo: { bar: "bg-indigo-400", chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
};

/** GTA skill bars are segmented — 10 blocks, the current one partly filled. */
function SegmentBar({ progress, tone }: { progress: number; tone: string }) {
  return (
    <div className="flex gap-1 -skew-x-12">
      {Array.from({ length: 10 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, progress / 10 - i));
        return (
          <span key={i} className="h-2.5 flex-1 bg-muted overflow-hidden">
            <span className={cn("block h-full transition-[width] duration-700", TONE[tone]?.bar)} style={{ width: `${fill * 100}%`, transitionDelay: `${i * 40}ms` }} />
          </span>
        );
      })}
    </div>
  );
}

export function LevelView({ hud: h, name, image }: { hud: Hud; name: string; image: string | null }) {
  const best = [...h.skills].sort((a, b) => b.xp - a.xp)[0];
  const weakest = [...h.skills].sort((a, b) => a.xp - b.xp)[0];
  const rankIndex = RANKS.findIndex((r) => r.name === h.rank);
  const stats = [
    { label: "This month", value: `${fmt(h.monthKm)} KM`, icon: Coins, tone: "text-emerald-500 bg-emerald-500/15" },
    { label: "All time", value: `${fmt(h.totalKm)} KM`, icon: Vault, tone: "text-violet-500 bg-violet-500/15" },
    { label: "Streak", value: `${h.streak} days`, icon: Flame, tone: "text-orange-500 bg-orange-500/15" },
    { label: "Clients", value: String(h.clients), icon: Handshake, tone: "text-sky-500 bg-sky-500/15" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      {/* Player card */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 animate-in fade-in-0 slide-in-from-bottom-2">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" referrerPolicy="no-referrer" className="w-20 h-20 rounded-2xl object-cover border border-border" />
            ) : (
              <div className={cn("w-20 h-20 rounded-2xl bg-foreground text-background flex items-center justify-center text-3xl", hud)}>{name.slice(0, 1)}</div>
            )}
            <span className={cn("absolute -bottom-2 -right-2 h-7 px-2 inline-flex items-center bg-teal-400 text-black -skew-x-12 text-sm", hud)}>
              <span className="skew-x-12">LV {h.level}</span>
            </span>
          </div>
          <div className="flex-1 min-w-48">
            <p className={cn("text-xs text-muted-foreground", hud)}>Player</p>
            <h1 className={cn("text-4xl leading-none", hud)}>{name}</h1>
            <p className={cn("mt-1 text-lg text-teal-600 dark:text-teal-400", hud)}>{h.rank}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-3xl leading-none tabular-nums", hud)}>{fmt(h.xp)} <span className="text-base text-muted-foreground">XP</span></p>
            <p className="text-xs text-muted-foreground mt-1">{fmt(h.need - h.into)} XP to level {h.level + 1}</p>
            {h.achievements > 0 && <p className="text-[11px] text-muted-foreground">incl. +{fmt(h.achievementXp)} from {h.achievements} badges</p>}
          </div>
        </div>
        <div className="mt-6 h-3 bg-muted overflow-hidden -skew-x-12">
          <div className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-[width] duration-1000" style={{ width: `${h.progress}%` }} />
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <span className={cn("w-8 h-8 rounded-full flex items-center justify-center", s.tone)}><s.icon className="w-4 h-4" /></span>
              <span>
                <span className={cn("block text-lg leading-none tabular-nums", hud)}>{s.value}</span>
                <span className="block text-[11px] text-muted-foreground">{s.label}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mt-8">
        <div className="flex items-end justify-between mb-3">
          <h2 className={cn("text-xl", hud)}>Skills</h2>
          <p className="text-xs text-muted-foreground">Strongest: {best.emoji} {best.label} · Train next: {weakest.emoji} {weakest.label}</p>
        </div>
        <ul className="grid md:grid-cols-2 gap-3">
          {h.skills.map((s, i) => (
            <li key={s.key} style={{ animationDelay: `${i * 50}ms` }} className="rounded-2xl border border-border bg-card p-4 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both group">
              <div className="flex items-center gap-3">
                <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl", TONE[s.tone]?.chip)}>{s.emoji}</span>
                <div className="flex-1">
                  <p className={cn("text-lg leading-none", hud)}>{s.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">{fmt(s.xp)} XP · {fmt(s.need - s.into)} to next</p>
                </div>
                <span className={cn("text-2xl tabular-nums", hud)}>{s.level}</span>
              </div>
              <div className="mt-3"><SegmentBar progress={s.progress} tone={s.tone} /></div>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{s.how}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Rank ladder */}
      <section className="mt-8">
        <h2 className={cn("text-xl mb-3", hud)}>Rank ladder</h2>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RANKS.map((r, i) => {
            const done = i < rankIndex;
            const current = i === rankIndex;
            return (
              <li key={r.name} className={cn("rounded-xl border p-3 transition-colors", current ? "border-teal-400 bg-teal-400/10" : done ? "border-border bg-muted/40" : "border-dashed border-border opacity-60")}>
                <p className={cn("text-base leading-none flex items-center gap-1.5", hud)}>
                  {current ? <Sparkles className="w-3.5 h-3.5 text-teal-500" /> : !done && <Lock className="w-3 h-3" />}{r.name}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">from level {r.fromLevel}</p>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="mt-8 text-[11px] text-muted-foreground">Every point comes from your real data — tasks, check-ins, outreach, gigs, income, commits, YouTube, beats, training, prayers and reading. Nothing is awarded for just opening the app.</p>
    </div>
  );
}
