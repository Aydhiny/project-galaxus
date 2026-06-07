"use client";

import { useState, useEffect } from "react";
import { StreakRing } from "@/components/streak-ring";
import Link from "next/link";
import {
  BookOpen, Dumbbell, Moon, CheckCircle2,
  Quote, ChevronRight, Flame, Sparkles, GitBranch, Play,
} from "lucide-react";

interface Props {
  quote: { text: string; source: string };
  dateStr: string;
  streaks: { training: number; meditation: number; music: number; writing: number; gratitude: number; prayers: number };
  prayersDone: number;
  completedGoals: number;
  totalGoals: number;
  readingStats: { completedThisMonth: number; currentlyReading: number; totalCompleted: number; planned: number };
  videos: { id: string; title: string; channel: string }[];
}

export function FeedClient({
  quote, dateStr, streaks, prayersDone,
  completedGoals, totalGoals, readingStats, videos,
}: Props) {
  const [typed, setTyped] = useState("");
  const greeting = "As-salamu alaykum, Ajdin.";

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      setTyped(greeting.slice(0, i + 1));
      i++;
      if (i >= greeting.length) clearInterval(iv);
    }, 55);
    return () => clearInterval(iv);
  }, []);

  const goalPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  return (
    <div className="min-h-full">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-card border-b border-border px-6 pt-10 pb-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-6 right-16 w-48 h-48 rounded-full blur-3xl opacity-15" style={{ background: "var(--gold)" }} />
          <div className="absolute bottom-0 left-1/3 w-72 h-36 rounded-full blur-3xl opacity-10" style={{ background: "oklch(0.70 0.15 155)" }} />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-2">{dateStr}</p>
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "var(--font-heading)", minHeight: "2.5rem" }}>
            {typed}<span className="animate-pulse text-[var(--gold)]">|</span>
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم — In the name of Allah, the Most Gracious.
          </p>
          <div className="flex flex-wrap gap-2">
            <StatPill icon={<Moon className="w-3 h-3" />} label={`${prayersDone}/5 prayers`} color="var(--emerald)" active={prayersDone > 0} />
            <StatPill icon={<CheckCircle2 className="w-3 h-3" />} label={`${completedGoals}/${totalGoals} goals`} color="var(--gold)" active={completedGoals > 0} />
            <StatPill icon={<Flame className="w-3 h-3" />} label={`${streaks.training}d training`} color="oklch(0.70 0.19 32)" active={streaks.training > 0} />
            <StatPill icon={<BookOpen className="w-3 h-3" />} label={`${readingStats.currentlyReading} reading`} color="oklch(0.65 0.20 290)" active={readingStats.currentlyReading > 0} />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* ── Quote ──────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-[var(--gold-muted)] p-6 relative overflow-hidden">
          <Quote className="absolute top-4 right-4 w-8 h-8 text-[var(--gold)]/15" />
          <p className="text-lg font-medium leading-relaxed" style={{ fontFamily: "var(--font-heading)" }}>
            &ldquo;{quote.text}&rdquo;
          </p>
          <p className="text-sm text-muted-foreground mt-3">— {quote.source}</p>
        </div>

        {/* ── Streaks ────────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader title="Current Streaks" icon={<Flame className="w-4 h-4" />} />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 p-5 rounded-2xl border border-border bg-card warm-card">
            <StreakRing value={streaks.prayers}   label="Prayers"   color="var(--emerald)" />
            <StreakRing value={streaks.training}  label="Training"  color="var(--gold)" />
            <StreakRing value={streaks.meditation} label="Meditation" color="oklch(0.65 0.20 290)" />
            <StreakRing value={streaks.music}     label="Music"     color="oklch(0.70 0.19 32)" />
            <StreakRing value={streaks.gratitude} label="Gratitude" color="oklch(0.65 0.18 200)" />
            <StreakRing value={streaks.writing}   label="Writing"   color="oklch(0.62 0.18 25)" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Left: today's stats + quick nav ──────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5 warm-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Today&apos;s Progress</h3>
                <span className="text-2xl font-bold text-[var(--gold)]">{goalPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
                <div className="h-full rounded-full progress-bar transition-all duration-700" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Prayers",  val: `${prayersDone}/5`,                    href: "/daily" },
                  { label: "Training", val: streaks.training > 0 ? "Active" : "—", href: "/training" },
                  { label: "Reading",  val: `${readingStats.currentlyReading} active`, href: "/reading" },
                  { label: "Goals",    val: `${completedGoals}/${totalGoals}`,      href: "/goals" },
                ].map((s) => (
                  <Link key={s.label} href={s.href}
                    className="rounded-xl border border-border bg-muted/30 p-3 hover:bg-muted/60 transition-colors">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                    <p className="font-semibold text-sm mt-0.5">{s.val}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Daily Check-in", href: "/daily",      icon: <CheckCircle2 className="w-4 h-4" />, color: "var(--gold)" },
                { label: "Home Workout",   href: "/workout",    icon: <Dumbbell className="w-4 h-4" />,     color: "oklch(0.70 0.19 32)" },
                { label: "Meditate",       href: "/meditation", icon: <Sparkles className="w-4 h-4" />,     color: "oklch(0.65 0.20 290)" },
                { label: "Spiritual",      href: "/spiritual",  icon: <Moon className="w-4 h-4" />,         color: "var(--emerald)" },
              ].map((c) => (
                <Link key={c.href} href={c.href}
                  className="rounded-xl border border-border bg-card p-3 flex items-center gap-2 hover:bg-accent transition-colors group warm-card">
                  <span style={{ color: c.color }}>{c.icon}</span>
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{c.label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* ── Right: videos + GitHub ───────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-5">
            {/* Videos — randomised each refresh, play inline */}
            <div>
              <SectionHeader title="Watch Today" icon={<Play className="w-4 h-4" />} />
              <div className="grid grid-cols-2 gap-3">
                {videos.map((v) => (
                  <InlineVideoCard key={v.id} id={v.id} title={v.title} channel={v.channel} />
                ))}
              </div>
            </div>

            <div>
              <SectionHeader title="GitHub Activity" icon={<GitBranch className="w-4 h-4" />} />
              <div className="rounded-2xl border border-border bg-card p-4 warm-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://ghchart.rshah.org/C9A84C/Aydhiny"
                  alt="GitHub contribution graph"
                  className="w-full h-auto rounded-lg"
                  style={{ filter: "var(--gh-chart-filter, saturate(1.3))" }}
                />
                <p className="text-[10px] text-muted-foreground mt-2 text-right">github.com/Aydhiny</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ icon, label, color, active }: { icon: React.ReactNode; label: string; color: string; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        active ? "border-transparent text-background" : "border-border text-muted-foreground"
      }`}
      style={active ? { background: color } : {}}
    >
      {icon}{label}
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

// Click thumbnail → embed replaces it with autoplay
// This works because the click IS the user gesture that unlocks autoplay
function InlineVideoCard({ id, title, channel }: { id: string; title: string; channel: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="rounded-xl border border-[var(--gold)]/30 bg-card overflow-hidden warm-card">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="w-full aspect-video"
          title={title}
        />
        <div className="px-3 py-2">
          <p className="text-xs font-medium line-clamp-1">{title}</p>
          <p className="text-[10px] text-muted-foreground">{channel}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="group rounded-xl border border-border bg-card overflow-hidden hover:border-[var(--gold)]/40 transition-all warm-card text-left w-full"
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
          alt={title}
          className="w-full aspect-video object-cover opacity-80 group-hover:opacity-100 transition-opacity"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center group-hover:bg-[var(--gold)] transition-colors">
            <Play className="w-4 h-4 text-white ml-0.5" />
          </div>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-medium line-clamp-2 leading-snug">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{channel}</p>
      </div>
    </button>
  );
}
