"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
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
import { SpotlightCard } from "@/components/aceternity/spotlight-card";
import { MovingBorderBtn } from "@/components/aceternity/moving-border-btn";
import { BackgroundBeams } from "@/components/aceternity/background-beams";

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
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "friend";
  const today = new Date().toISOString().slice(0, 10);
  const greeting = `As-salamu alaykum, ${firstName}.`;
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
    <div className="min-h-full page-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden bg-card border-b border-border px-6 pt-10 pb-8">
        <BackgroundBeams />
        {/* glow orbs */}
        <div className="absolute top-4 right-16 w-64 h-64 rounded-full blur-[80px] opacity-20 bg-[#173eff]" />
        <div className="absolute bottom-0 left-1/3 w-72 h-40 rounded-full blur-[80px] bg-[#7c3aed]" style={{ opacity: 0.12 }} />
        <div className="absolute top-0 left-0 right-0 lw-top-accent" />
        <div className="relative max-w-5xl mx-auto z-10">
          <div className="flex items-center justify-between gap-4 mb-2">
            <p className="text-xs text-white/40 uppercase tracking-[0.2em]">{dateStr}</p>
            <p className="text-xs text-white/30">{hijri.short}{hijri.isFriday ? " · Jumu'ah" : ""}{hijri.isRamadan ? " · Ramadan" : ""}</p>
          </div>
          <h1 className="text-3xl font-bold mb-1 flex items-baseline gap-0" style={{ fontFamily: "var(--font-heading)", minHeight: "2.5rem" }}>
            <span className="heading-gradient">{typed}</span>
            <span className="text-[#3b82f6] animate-pulse" style={{ WebkitTextFillColor: "#3b82f6" }}>|</span>
          </h1>
          <p className="text-white/40 text-sm mb-4">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم — In the name of Allah, the Most Gracious.</p>
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
        <SpotlightCard spotlightColor="rgba(245,158,11,0.10)" className="border-[var(--gold)]/20 bg-[var(--gold-muted)]" padding="p-6">
          <Quote className="absolute top-4 right-4 w-8 h-8 text-[var(--gold)]/15" />
          <p className="text-lg font-medium leading-relaxed" style={{ fontFamily: "var(--font-heading)" }}>&ldquo;{quote.text}&rdquo;</p>
          <p className="text-sm text-muted-foreground mt-3">— {quote.source}</p>
        </SpotlightCard>

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
          {/* Spotlight streak cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { value: streaks.prayers,   label: "Prayers",    color: "#10b981" },
              { value: streaks.training,  label: "Training",   color: "#f59e0b" },
              { value: streaks.meditation,label: "Meditation", color: "#a78bfa" },
              { value: streaks.music,     label: "Music",      color: "#f97316" },
              { value: streaks.gratitude, label: "Gratitude",  color: "#06b6d4" },
              { value: streaks.writing,   label: "Writing",    color: "#ef4444" },
            ].map(s => (
              <SpotlightCard key={s.label} spotlightColor={`${s.color}20`} padding="p-4" className="flex flex-col items-center">
                <StreakRing value={s.value} label={s.label} color={s.color} />
              </SpotlightCard>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left */}
          <div className="lg:col-span-2 space-y-5">
            {/* Progress card */}
            <SpotlightCard elevated spotlightColor="rgba(23,62,255,0.15)" padding="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Today&apos;s Progress</h3>
                <span className="text-2xl font-bold text-foreground">{goalPct}%</span>
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
                  <Link key={s.label} href={s.href} className="rounded-xl border border-border bg-muted/30 p-3 hover:bg-muted/60 transition-colors hover:border-[#173eff]/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                    <p className="font-semibold text-sm mt-0.5">{s.val}</p>
                  </Link>
                ))}
              </div>
            </SpotlightCard>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Daily Check-in", href: "/daily",      icon: <CheckCircle2 className="w-4 h-4" />, color: "var(--gold)" },
                { label: "Home Workout",   href: "/workout",    icon: <Dumbbell className="w-4 h-4" />,     color: "oklch(0.70 0.19 32)" },
                { label: "Meditate",       href: "/meditation", icon: <Sparkles className="w-4 h-4" />,     color: "oklch(0.65 0.20 290)" },
                { label: "Spiritual",      href: "/spiritual",  icon: <Moon className="w-4 h-4" />,         color: "var(--emerald)" },
              ].map(c => (
                <Link key={c.href} href={c.href} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2 hover:bg-accent transition-colors group hover:border-[#173eff]/30 lw-card-glow">
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
                <MovingBorderBtn
                  onClick={refreshVideos}
                  containerClassName="h-8"
                  className="h-8"
                  innerClassName="px-3 text-xs gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  New picks
                </MovingBorderBtn>
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
              <SpotlightCard elevated spotlightColor="rgba(23,62,255,0.10)" padding="p-4" className="mt-3 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://ghchart.rshah.org/C9A84C/Aydhiny" alt="GitHub contributions"
                  className="w-full h-auto rounded-lg"
                  style={{ filter: "var(--gh-chart-filter, saturate(1.3))" }} />
                <p className="text-[10px] text-muted-foreground mt-2 text-right">github.com/Aydhiny</p>
              </SpotlightCard>
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
        boxShadow: "0 2px 12px rgba(23,62,255,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
      } : {}}
    >
      {icon}{label}
    </div>
  );
}
function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-[#173eff]/20 to-transparent ml-2" />
    </div>
  );
}

function InlineVideoCard({ id, title, channel }: FeedVideo) {
  const { pinned, setPinned } = useFeedVideoStore();
  const isThisPinned = pinned?.id === id;

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
    <button onClick={handlePlay} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-[#173eff]/50 transition-all text-left w-full hover:shadow-[0_0_20px_#173eff20] hover:-translate-y-0.5">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`} alt={title}
          className="w-full aspect-video object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all duration-300",
            isThisPinned ? "bg-[#173eff] shadow-[0_0_20px_#173eff60]" : "bg-black/60 group-hover:bg-[#173eff] group-hover:shadow-[0_0_16px_#173eff60]"
          )}>
            <Play className="w-4 h-4 text-white ml-0.5" />
          </div>
        </div>
        {isThisPinned && (
          <div className="absolute top-2 left-2 bg-[#173eff] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-[0_0_8px_#173eff80]">
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
