import Link from "next/link";
import {
  BookHeart, Clapperboard, Coins, Handshake, Heart, ListChecks, Moon, Radar, Send, Shield, Target, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { moodOf } from "@/lib/diary";
import type { WeekOverview as Week } from "@/lib/services/week";

const hud = "font-hud uppercase tracking-wide";

/** Everything this week, across all of Galaxus — each tile links to where it lives. */
export function WeekOverview({ w }: { w: Week }) {
  const tiles = [
    { href: "/money", icon: Coins, tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/12", value: `${w.earnedKm.toLocaleString()} KM`, label: "earned" },
    { href: "/deals", icon: Handshake, tone: "text-teal-600 dark:text-teal-400 bg-teal-500/12", value: String(w.dealsOpen), label: `open deals · ${w.pipelineKm.toLocaleString()} KM${w.dealsReady ? ` · ${w.dealsReady} ready` : ""}` },
    { href: "/gigs", icon: Radar, tone: "text-sky-600 dark:text-sky-400 bg-sky-500/12", value: String(w.gigsApplied), label: `gigs applied · ${w.gigsNew} found · ${w.gigReplies} replies` },
    { href: "/outreach", icon: Send, tone: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/12", value: String(w.outreachSent), label: `outreach sent · ${w.outreachReplies} replies` },
    { href: "/tasks", icon: ListChecks, tone: "text-violet-600 dark:text-violet-400 bg-violet-500/12", value: String(w.tasksDone), label: "tasks done" },
    { href: "/level", icon: Target, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/12", value: `${Math.round(w.focusMinutes / 6) / 10}h`, label: `focus · ${w.focusSessions} sessions` },
    { href: "/hold", icon: Shield, tone: "text-rose-600 dark:text-rose-400 bg-rose-500/12", value: `${w.daysWon}/${w.days}`, label: `days won · held ${w.held}×` },
    { href: "/hold", icon: Moon, tone: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/12", value: String(w.goodNights), label: "good nights (all time)" },
    { href: "/diary", icon: BookHeart, tone: "text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/12", value: String(w.diaryEntries), label: `diary entries · ${w.gratitudes} gratitude` },
    { href: "/youtube", icon: Clapperboard, tone: "text-red-600 dark:text-red-400 bg-red-500/12", value: String(w.videos), label: `uploads · ${w.videoViews.toLocaleString()} views` },
  ];
  const moods = Object.entries(w.moods).sort((a, b) => b[1] - a[1]);
  return (
    <section className="rounded-3xl border border-border bg-card p-5 md:p-6 animate-in fade-in-0 slide-in-from-bottom-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">This week, everywhere</p>
          <h2 className={cn("text-2xl leading-none mt-1", hud)}>Your week at a glance</h2>
        </div>
        <Link href="/level" className="flex items-center gap-3 rounded-2xl border border-border px-3 py-2 hover:border-foreground/20 transition-colors">
          <Trophy className="w-4 h-4 text-teal-500" />
          <span>
            <span className={cn("block text-lg leading-none", hud)}>LV {w.level} · {w.rank}</span>
            <span className="block mt-1 h-1.5 w-28 bg-muted overflow-hidden -skew-x-12"><span className="block h-full bg-teal-400 bar-fill" style={{ width: `${w.progress}%` }} /></span>
          </span>
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2">
        {tiles.map((t, i) => (
          <Link key={t.label} href={t.href} style={{ animationDelay: `${i * 30}ms` }}
            className="rounded-2xl border border-border p-3 hover:border-foreground/20 hover:-translate-y-0.5 transition-all animate-in fade-in-0 fill-mode-both">
            <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center", t.tone)}><t.icon className="w-4 h-4" /></span>
            <p className={cn("mt-2 text-xl leading-none tabular-nums", hud)}>{t.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{t.label}</p>
          </Link>
        ))}
      </div>
      {moods.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
          <Heart className="w-3.5 h-3.5 text-rose-500" /> Moods in your diary:
          {moods.map(([m, c]) => <span key={m} className="rounded-full bg-muted px-2 py-0.5">{moodOf(m)?.emoji} {moodOf(m)?.label ?? m} ×{c}</span>)}
        </p>
      )}
    </section>
  );
}
