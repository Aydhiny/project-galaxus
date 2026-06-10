"use client";

import { useState, useEffect } from "react";
import { StreakRing } from "@/components/streak-ring";
import { PrayerCountdown } from "@/components/prayer-countdown";
import Link from "next/link";
import {
  BookOpen, Dumbbell, Moon, CheckCircle2,
  Quote, ChevronRight, Flame, Sparkles, GitBranch, Play, RefreshCw,
  Meh, Frown, Smile, Heart, Star,
} from "lucide-react";
import { VIDEO_POOL, pickRandomVideos, type FeedVideo } from "@/lib/constants/videos";
import { useFeedVideoStore } from "@/lib/store/feed-video";
import { moodColor, MOOD_LABELS, loadMoods, saveMood, type MoodEntry } from "@/lib/utils/mood";
import { toHijri } from "@/lib/hijri";
import { cn } from "@/lib/utils";

function MoodIcon({ mood }: { mood: number }) {
  if (mood === 0) return <Meh className="w-4 h-4 text-muted-foreground" />;
  if (mood <= 3) return <Frown className="w-4 h-4" style={{ color: moodColor(mood) }} />;
  if (mood <= 5) return <Meh className="w-4 h-4" style={{ color: moodColor(mood) }} />;
  if (mood <= 7) return <Smile className="w-4 h-4" style={{ color: moodColor(mood) }} />;
  if (mood <= 9) return <Heart className="w-4 h-4" style={{ color: moodColor(mood) }} />;
  return <Star className="w-4 h-4" style={{ color: moodColor(mood) }} />;
}

function loadTodayMood(today: string): number {
  return loadMoods().find((e: MoodEntry) => e.date === today)?.mood ?? 0;
}
function saveTodayMood(today: string, mood: number) {
  saveMood(today, mood);
}

interface Props {
  quote: { text: string; source: string };
  dateStr: string;
  streaks: { training: number; meditation: number; music: number; writing: number; gratitude: number; prayers: number };
  prayersDone: number;
  completedGoals: number;
  totalGoals: number;
  readingStats: { completedThisMonth: number; currentlyReading: number; totalCompleted: number; planned: number };
}

const SESSION_KEY = "galaxus-feed-videos-v2";

export function FeedClient({ quote, dateStr, streaks, prayersDone, completedGoals, totalGoals, readingStats }: Props) {
  const [typed, setTyped] = useState("");
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [todayMood, setTodayMood] = useState(0);
  const [moodOpen, setMoodOpen] = useState(false);
  const { pinned } = useFeedVideoStore();
  const today = new Date().toISOString().slice(0, 10);
  const greeting = "As-salamu alaykum, Ajdin.";
  const hijri = toHijri(new Date());

  useEffect(() => { setTodayMood(loadTodayMood(today)); }, [today]);

  function logMood(m: number) {
    saveTodayMood(today, m);
    setTodayMood(m);
    setMoodOpen(false);
  }

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => { setTyped(greeting.slice(0, i+1)); i++; if (i >= greeting.length) clearInterval(iv); }, 55);
    return () => clearInterval(iv);
  }, []);

  // Load from session storage — persists across navigation within the tab
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) { setVideos(JSON.parse(cached)); return; }
    } catch { /* ignore */ }
    const picked = pickRandomVideos(4);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(picked)); } catch { /* ignore */ }
    setVideos(picked);
  }, []);

  function refreshVideos() {
    const picked = pickRandomVideos(4);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(picked)); } catch { /* ignore */ }
    setVideos(picked);
  }

  const goalPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  return (
    <div className="min-h-full">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[oklch(0.095_0.022_258)] to-[oklch(0.065_0.020_258)] border-b border-[oklch(1_0_0/8%)] px-6 pt-10 pb-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-6 right-16 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: "oklch(0.58 0.28 258)" }} />
          <div className="absolute bottom-0 left-1/3 w-72 h-36 rounded-full blur-3xl opacity-10" style={{ background: "oklch(0.62 0.26 290)" }} />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-2">
            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">{dateStr}</p>
            <p className="text-xs text-muted-foreground/70">{hijri.short}{hijri.isFriday ? " · Jumu'ah" : ""}{hijri.isRamadan ? " · Ramadan" : ""}</p>
          </div>
          <h1 className="text-3xl font-bold mb-1 lw-gradient-text" style={{ fontFamily: "var(--font-heading)", minHeight: "2.5rem" }}>
            {typed}<span className="animate-pulse text-[#173eff]" style={{ WebkitTextFillColor: "initial" }}>|</span>
          </h1>
          <p className="text-muted-foreground text-sm mb-4">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم — In the name of Allah, the Most Gracious.</p>
          <div className="mb-4">
            <PrayerCountdown compact />
          </div>
          <div className="flex flex-wrap gap-2">
            <StatPill icon={<Moon className="w-3 h-3" />} label={`${prayersDone}/5 prayers`} color="var(--emerald)" active={prayersDone > 0} />
            <StatPill icon={<CheckCircle2 className="w-3 h-3" />} label={`${completedGoals}/${totalGoals} goals`} color="var(--gold)" active={completedGoals > 0} />
            <StatPill icon={<Flame className="w-3 h-3" />} label={`${streaks.training}d training`} color="oklch(0.70 0.19 32)" active={streaks.training > 0} />
            <StatPill icon={<BookOpen className="w-3 h-3" />} label={`${readingStats.currentlyReading} reading`} color="oklch(0.65 0.20 290)" active={readingStats.currentlyReading > 0} />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Quote */}
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-[var(--gold-muted)] p-6 relative overflow-hidden">
          <Quote className="absolute top-4 right-4 w-8 h-8 text-[var(--gold)]/15" />
          <p className="text-lg font-medium leading-relaxed" style={{ fontFamily: "var(--font-heading)" }}>&ldquo;{quote.text}&rdquo;</p>
          <p className="text-sm text-muted-foreground mt-3">— {quote.source}</p>
        </div>

        {/* Streaks + Mood */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionHeader title="Current Streaks" icon={<Flame className="w-4 h-4" />} />
            {/* Mood ring */}
            <div className="relative">
              <button onClick={() => setMoodOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm">
                <MoodIcon mood={todayMood} />
                <span className="text-xs text-muted-foreground">{todayMood > 0 ? MOOD_LABELS[todayMood] : "Log mood"}</span>
              </button>
              {moodOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-2xl p-4 w-64">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">How are you feeling?</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => logMood(n)}
                        className={cn("w-10 h-8 rounded-lg text-xs font-bold transition-all border",
                          todayMood === n ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-[var(--gold)]/30 bg-card"
                        )}
                        style={todayMood === n ? { background: moodColor(n) } : {}}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 p-5 rounded-2xl border border-border bg-card">
            <StreakRing value={streaks.prayers}    label="Prayers"    color="var(--emerald)" />
            <StreakRing value={streaks.training}   label="Training"   color="var(--gold)" />
            <StreakRing value={streaks.meditation} label="Meditation" color="oklch(0.65 0.20 290)" />
            <StreakRing value={streaks.music}      label="Music"      color="oklch(0.70 0.19 32)" />
            <StreakRing value={streaks.gratitude}  label="Gratitude"  color="oklch(0.65 0.18 200)" />
            <StreakRing value={streaks.writing}    label="Writing"    color="oklch(0.62 0.18 25)" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Today&apos;s Progress</h3>
                <span className="text-2xl font-bold text-[var(--gold)]">{goalPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
                <div className="h-full rounded-full progress-bar transition-all duration-700" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Prayers",  val: `${prayersDone}/5`,                     href: "/daily" },
                  { label: "Training", val: streaks.training > 0 ? "Active" : "—",  href: "/training" },
                  { label: "Reading",  val: `${readingStats.currentlyReading} books`, href: "/reading" },
                  { label: "Goals",    val: `${completedGoals}/${totalGoals}`,        href: "/goals" },
                ].map(s => (
                  <Link key={s.label} href={s.href} className="rounded-xl border border-border bg-muted/30 p-3 hover:bg-muted/60 transition-colors">
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
              ].map(c => (
                <Link key={c.href} href={c.href} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2 hover:bg-accent transition-colors group">
                  <span style={{ color: c.color }}>{c.icon}</span>
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{c.label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="lg:col-span-3 space-y-5">
            {/* Videos */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionHeader title="Watch Today" icon={<Play className="w-4 h-4" />} />
                <button onClick={refreshVideos} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-3 h-3" />
                  New picks
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {videos.map(v => <InlineVideoCard key={v.id} {...v} />)}
              </div>
              {pinned && (
                <p className="text-[10px] text-[var(--gold)] mt-2 flex items-center gap-1">
                  <Play className="w-3 h-3" /> Playing in bottom bar — keeps going as you navigate
                </p>
              )}
            </div>

            {/* GitHub */}
            <div>
              <SectionHeader title="GitHub Activity" icon={<GitBranch className="w-4 h-4" />} />
              <div className="rounded-2xl border border-border bg-card p-4 overflow-hidden mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://ghchart.rshah.org/C9A84C/Aydhiny" alt="GitHub contributions"
                  className="w-full h-auto rounded-lg"
                  style={{ filter: "var(--gh-chart-filter, saturate(1.3))" }} />
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
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${active ? "border-transparent text-white" : "border-border text-muted-foreground"}`}
      style={active ? {
        backgroundImage: "linear-gradient(135deg, #173eff 0%, #3758f9 50%, #6366f1 100%)",
        boxShadow: "0 2px 12px rgba(23,62,255,0.35)",
      } : {}}
    >
      {icon}{label}
    </div>
  );
}
function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return <div className="flex items-center gap-2"><span className="text-muted-foreground">{icon}</span><h2 className="text-sm font-semibold">{title}</h2></div>;
}

function InlineVideoCard({ id, title, channel }: FeedVideo) {
  const { pinned, setPinned } = useFeedVideoStore();
  const isThisPinned = pinned?.id === id;

  // Playing inline OR is pinned to bottom bar
  const [playingInline, setPlayingInline] = useState(false);

  function handlePlay() {
    setPlayingInline(true);
    setPinned({ id, title, channel });
  }

  if (playingInline) return (
    <div className="rounded-xl border border-[var(--gold)]/30 bg-card overflow-hidden">
      <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
        className="w-full aspect-video" title={title} />
      <div className="px-3 py-2"><p className="text-xs font-medium line-clamp-1">{title}</p><p className="text-[10px] text-muted-foreground">{channel}</p></div>
    </div>
  );

  return (
    <button onClick={handlePlay} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-[#173eff]/40 transition-all text-left w-full">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`} alt={title}
          className="w-full aspect-video object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors",
            isThisPinned ? "bg-[#173eff]" : "bg-black/60 group-hover:bg-[#173eff]"
          )}>
            <Play className="w-4 h-4 text-white ml-0.5" />
          </div>
        </div>
        {isThisPinned && (
          <div className="absolute top-2 left-2 bg-[#173eff] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
            PLAYING
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-medium line-clamp-2 leading-snug">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{channel}</p>
      </div>
    </button>
  );
}
