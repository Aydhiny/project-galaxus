"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Castle, Crown, Eye, Flame, Globe2, Loader2, Lock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveEmpireSharingC, type PublicCity } from "@/lib/client/empire";

/** Deterministic spot on the map for a city (stable between visits). */
function spot(id: number) {
  let h = id * 2654435761 % 4294967296;
  const r = () => ((h = (h * 1103515245 + 12345) % 2147483648) / 2147483648);
  return { x: 10 + r() * 80, y: 14 + r() * 70 };
}

export function WorldView({ cities, sharing }: { cities: PublicCity[]; sharing: { isPublic: boolean; cityName: string | null } }) {
  const [isPublic, setPublic] = useState(sharing.isPublic);
  const [name, setName] = useState(sharing.cityName ?? "");
  const [busy, start] = useTransition();
  const month = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function save(nextPublic = isPublic) {
    start(async () => {
      try {
        await saveEmpireSharingC({ isPublic: nextPublic, cityName: name.trim() || null });
        setPublic(nextPublic);
        toast.success(nextPublic ? "Your city is on the map." : "Your city is private.");
      } catch (e) { toast.error((e as Error).message); }
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-10 py-8 md:py-12">
      <Link href="/empire" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Your empire</Link>
      <header className="mt-3">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center"><Globe2 className="w-5 h-5" /></span>
          World
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Visit other builders&apos; cities and compete in the monthly contest, ranked on real progress, never on spending.</p>
      </header>

      {/* Sharing */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <span className={cn("w-10 h-10 shrink-0 rounded-xl flex items-center justify-center", isPublic ? "bg-emerald-500/12 text-emerald-600" : "bg-muted text-muted-foreground")}>
          {isPublic ? <Eye className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{isPublic ? "Your city is on the map" : "Your city is private"}</p>
          <p className="text-xs text-muted-foreground">Visitors see building levels, weather, streak and goal progress as numbers. Never goal names, emails, deals, money amounts or your diary.</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="City name" className="h-9 w-full sm:w-40 rounded-lg border border-border bg-transparent px-3 text-sm" />
          <button onClick={() => save(!isPublic)} disabled={busy}
            className={cn("h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap inline-flex items-center gap-1.5", isPublic ? "border border-border" : "bg-foreground text-background")}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{isPublic ? "Make private" : "Share my city"}
          </button>
          {isPublic && <button onClick={() => save(true)} disabled={busy} className="h-9 px-3 rounded-lg border border-border text-sm">Save</button>}
        </div>
      </section>

      <div className="mt-6 grid lg:grid-cols-[1fr_22rem] gap-4">
        {/* Map */}
        <section className="relative rounded-3xl overflow-hidden border border-border aspect-[4/3] sm:aspect-[16/10] bg-[radial-gradient(ellipse_at_30%_30%,#bfe3f5,transparent_60%),radial-gradient(ellipse_at_70%_70%,#cde9d4,transparent_55%)] bg-sky-100 dark:bg-slate-900">
          <svg className="absolute inset-0 w-full h-full opacity-50" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden>
            <path d="M8 40 C18 18, 35 12, 48 22 S 70 10, 88 24 S 94 52, 76 58 S 40 66, 26 58 S 2 56, 8 40 Z" fill="#a7d3a0" />
            <path d="M58 44 C64 38, 74 40, 76 46 S 66 54, 60 52 Z" fill="#8ec5e8" />
          </svg>
          {cities.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-slate-700 bg-white/80 rounded-xl px-4 py-3">No shared cities yet. Be the first: tap “Share my city”.</p>
            </div>
          )}
          {cities.map((c, i) => {
            const p = spot(c.userId);
            return (
              <Link key={c.userId} href={`/empire/visit/${c.userId}`} style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${i * 60}ms` }}
                className="absolute -translate-x-1/2 -translate-y-full group animate-in fade-in-0 zoom-in-90 fill-mode-both">
                <span className={cn("flex flex-col items-center")}>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-md whitespace-nowrap", c.isSelf ? "bg-sky-500 text-white" : "bg-black/70 text-white group-hover:bg-black/85")}>
                    {i === 0 && <Crown className="inline w-3 h-3 mr-0.5 -mt-0.5 text-amber-300" />}{c.name} · LV {c.level}
                  </span>
                  <span className="mt-0.5 w-8 h-8 rounded-xl bg-white shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Castle className="w-4 h-4 text-sky-700" />
                  </span>
                </span>
              </Link>
            );
          })}
        </section>

        {/* Contest */}
        <section className="rounded-3xl border border-border bg-card p-4">
          <h2 className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> City contest · {month}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Score = XP gained this month + 10 per streak day (max 31).</p>
          <ol className="mt-3 space-y-1.5">
            {cities.length === 0 && <li className="text-sm text-muted-foreground">Nobody is competing yet.</li>}
            {cities.map((c, i) => (
              <li key={c.userId}>
                <Link href={`/empire/visit/${c.userId}`} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted transition-colors", c.isSelf && "bg-sky-500/10")}>
                  <span className={cn("w-6 text-center font-hud text-lg", i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-700" : "text-muted-foreground")}>{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{c.name}{c.isSelf && " (you)"}</span>
                    <span className="block text-[11px] text-muted-foreground">LV {c.level} {c.rank} · +{c.xpGained} XP · <Flame className="inline w-3 h-3 -mt-0.5" />{c.streak}</span>
                  </span>
                  <span className="font-hud text-lg tabular-nums">{c.score}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
