"use client";

import { useEffect, useState } from "react";
import { getRecentCheckins } from "@/lib/actions/checkin";
import { getBooks } from "@/lib/actions/books";
import { getJournalEntries } from "@/lib/actions/journal";
import { getCourses } from "@/lib/actions/courses";
import { loadMoods } from "@/lib/utils/mood";
import { format, subDays, getDay } from "date-fns";
import {
  Moon, Dumbbell, BookOpen, Music2, NotebookPen, Heart, Star,
  TrendingUp, Award, Flame, Sparkles, GraduationCap, Calendar,
} from "lucide-react";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { CountUp } from "@/components/lw/count-up";

interface YearStats {
  // Prayers
  totalPrayerDays: number;   // days with all 5
  totalPrayers: number;
  prayerRate: number;        // %
  bestPrayerStreak: number;

  // Training
  trainingDays: number;
  trainingRate: number;
  bestTrainingStreak: number;

  // Creative
  musicDays: number;
  totalMusicMins: number;

  // Knowledge
  booksRead: number;
  coursesCompleted: number;
  journalEntries: number;
  writingDays: number;

  // Mood
  avgMood: number;
  bestMoodMonth: string;

  // Other
  meditationDays: number;
  gratitudeDays: number;
  totalCheckins: number;
}

function calcBestStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i-1] + "T12:00");
    const curr = new Date(sorted[i]  + "T12:00");
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (Math.round(diff) === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

const YEAR = new Date().getFullYear();

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  // Parse numeric value from strings like "42d" or "7.5/10"
  const numericValue = typeof value === "number"
    ? value
    : parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
  const suffix = typeof value === "string"
    ? String(value).replace(/^[0-9.]+/, "")
    : "";

  return (
    <div className="glass p-5 space-y-3 lw-card-glow">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color }}>
          <CountUp
            value={numericValue}
            suffix={suffix}
            decimals={suffix.includes(".") || (typeof value === "number" && value % 1 !== 0) ? 1 : 0}
            className="text-2xl"
          />
        </div>
        <p className="text-xs font-semibold text-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function YearlyHeatmap({ dates, color }: { dates: string[]; color: string }) {
  const dateSet = new Set(dates);
  const today = new Date();
  const start = new Date(YEAR, 0, 1);
  const days: { date: string; active: boolean; month: number }[] = [];

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const ds = format(d, "yyyy-MM-dd");
    days.push({ date: ds, active: dateSet.has(ds), month: d.getMonth() });
  }

  const padStart = getDay(start);
  const cells = [
    ...Array.from({ length: padStart }, (_, i) => ({ date: `pad-${i}`, active: false, month: -1 })),
    ...days,
  ];
  const weeks: typeof cells[number][][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-max">
        <div className="flex mb-1 gap-[2px]">
          {weeks.map((week, wi) => {
            const first = week.find(c => c.month >= 0);
            const prevFirst = wi > 0 ? weeks[wi-1].find(c => c.month >= 0) : null;
            const showLabel = first && (!prevFirst || first.month !== prevFirst.month);
            return (
              <div key={wi} className="w-[10px] text-[8px] text-muted-foreground">
                {showLabel ? MONTHS[first.month] : ""}
              </div>
            );
          })}
        </div>
        <div className="flex gap-[2px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map((cell, di) => (
                <div key={di}
                  title={cell.month >= 0 ? `${cell.date} — ${cell.active ? "Done" : "Not done"}` : ""}
                  className="w-[10px] h-[10px] rounded-[2px] transition-colors"
                  style={{ background: cell.active ? color : cell.month >= 0 ? "oklch(1 0 0 / 8%)" : "transparent" }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function YearlyPage() {
  const [stats, setStats] = useState<YearStats | null>(null);
  const [trainingDates, setTrainingDates] = useState<string[]>([]);
  const [prayerDates, setPrayerDates]     = useState<string[]>([]);
  const [musicDates, setMusicDates]       = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      getRecentCheckins(365),
      getBooks(),
      getJournalEntries(),
      getCourses(),
    ]).then(([checkins, books, journal, courses]) => {
      const moods = loadMoods();
      const yearCheckins = checkins.filter(c => c.date.startsWith(String(YEAR)));

      const allPrayer5 = yearCheckins.filter(c => c.fajr && c.dhuhr && c.asr && c.maghrib && c.isha).map(c => c.date);
      const totalPrayers = yearCheckins.reduce((acc, c) =>
        acc + [c.fajr, c.dhuhr, c.asr, c.maghrib, c.isha].filter(Boolean).length, 0);
      const trainDates = yearCheckins.filter(c => c.training).map(c => c.date);
      const musicD     = yearCheckins.filter(c => c.music).map(c => c.date);
      const totalMusicMins = yearCheckins.reduce((acc, c) => acc + (c.musicMinutes ?? 0), 0);
      const meditationDays = yearCheckins.filter(c => c.meditation).length;
      const gratitudeDays  = yearCheckins.filter(c => c.gratitude).length;
      const writingDays    = yearCheckins.filter(c => c.writing).length;

      const yearMoods = moods.filter(m => m.date.startsWith(String(YEAR)));
      const avgMood = yearMoods.length
        ? parseFloat((yearMoods.reduce((s, m) => s + m.mood, 0) / yearMoods.length).toFixed(1))
        : 0;

      // Best mood month
      const monthMoods: Record<string, number[]> = {};
      for (const m of yearMoods) {
        const mon = m.date.slice(0, 7);
        if (!monthMoods[mon]) monthMoods[mon] = [];
        monthMoods[mon].push(m.mood);
      }
      let bestMoodMonth = "";
      let bestAvg = 0;
      for (const [mon, vals] of Object.entries(monthMoods)) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (avg > bestAvg) { bestAvg = avg; bestMoodMonth = mon; }
      }
      if (bestMoodMonth) {
        const [y, m] = bestMoodMonth.split("-");
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        bestMoodMonth = monthNames[parseInt(m) - 1];
      }

      const possibleDays = Math.min(yearCheckins.length || 1, 365);
      setTrainingDates(trainDates);
      setPrayerDates(allPrayer5);
      setMusicDates(musicD);

      setStats({
        totalPrayerDays: allPrayer5.length,
        totalPrayers,
        prayerRate: Math.round((allPrayer5.length / possibleDays) * 100),
        bestPrayerStreak: calcBestStreak(allPrayer5),
        trainingDays: trainDates.length,
        trainingRate: Math.round((trainDates.length / possibleDays) * 100),
        bestTrainingStreak: calcBestStreak(trainDates),
        musicDays: musicD.length,
        totalMusicMins,
        booksRead: books.filter(b => b.status === "completed" && b.completedAt?.startsWith(String(YEAR))).length,
        coursesCompleted: courses.filter(c => c.status === "completed" && c.year === YEAR).length,
        journalEntries: journal.filter(e => e.date.startsWith(String(YEAR))).length,
        writingDays,
        avgMood,
        bestMoodMonth,
        meditationDays,
        gratitudeDays,
        totalCheckins: yearCheckins.length,
      });
    });
  }, []);

  return (
    <ErrorBoundary label="Yearly Review">
      <div className="page">
        {/* Hero */}
        <div className="glass p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: "var(--gold)", transform: "translate(30%, -30%)" }} />
          <div className="relative">
            <p className="section-label mb-2">{YEAR} — Year in Review</p>
            <h1 className="text-4xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>
              Your {YEAR}.
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-md">
              Every prayer, every session, every page — compiled.
              {stats ? ` You logged ${stats.totalCheckins} check-ins this year.` : ""}
            </p>
          </div>
        </div>

        {!stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({length:8}).map((_,i) => <CardSkeleton key={i} rows={2} />)}
          </div>
        ) : (
          <>
            {/* Spiritual */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Moon className="w-4 h-4 text-[var(--emerald)]" /> Spiritual
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={<Moon className="w-4 h-4"/>}    label="Perfect prayer days" value={stats.totalPrayerDays}       color="var(--emerald)" sub={`${stats.prayerRate}% of year`} />
                <StatCard icon={<Sparkles className="w-4 h-4"/>} label="Total prayers logged" value={stats.totalPrayers}         color="var(--emerald)" sub="out of possible 1825" />
                <StatCard icon={<Flame className="w-4 h-4"/>}    label="Best prayer streak"   value={`${stats.bestPrayerStreak}d`} color="var(--emerald)" />
                <StatCard icon={<Heart className="w-4 h-4"/>}    label="Gratitude entries"    value={stats.gratitudeDays}         color="var(--emerald)" />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-3">Prayer completion heatmap — {YEAR}</p>
                <YearlyHeatmap dates={prayerDates} color="var(--emerald)" />
              </div>
            </section>

            {/* Body */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-[var(--gold)]" /> Body & Mind
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={<Dumbbell className="w-4 h-4"/>}  label="Training days"      value={stats.trainingDays}             color="var(--gold)" sub={`${stats.trainingRate}% of year`} />
                <StatCard icon={<TrendingUp className="w-4 h-4"/>} label="Best training streak" value={`${stats.bestTrainingStreak}d`} color="var(--gold)" />
                <StatCard icon={<Sparkles className="w-4 h-4"/>}   label="Meditation days"    value={stats.meditationDays}           color="oklch(0.65 0.20 290)" />
                <StatCard icon={<Star className="w-4 h-4"/>}       label="Avg mood"           value={stats.avgMood > 0 ? `${stats.avgMood}/10` : "—"} color="oklch(0.72 0.18 50)" sub={stats.bestMoodMonth ? `Best month: ${stats.bestMoodMonth}` : undefined} />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-3">Training heatmap — {YEAR}</p>
                <YearlyHeatmap dates={trainingDates} color="var(--gold)" />
              </div>
            </section>

            {/* Creative */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Music2 className="w-4 h-4" style={{ color: "oklch(0.65 0.20 290)" }} /> Creative
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={<Music2 className="w-4 h-4"/>}   label="Music days"       value={stats.musicDays}   color="oklch(0.65 0.20 290)" />
                <StatCard icon={<Calendar className="w-4 h-4"/>} label="Total music time" value={`${Math.round(stats.totalMusicMins / 60)}h`} color="oklch(0.65 0.20 290)" sub={`${stats.totalMusicMins}m total`} />
                <StatCard icon={<Award className="w-4 h-4"/>}    label="Writing days"     value={stats.writingDays} color="oklch(0.65 0.20 290)" />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-3">Music sessions heatmap — {YEAR}</p>
                <YearlyHeatmap dates={musicDates} color="oklch(0.65 0.20 290)" />
              </div>
            </section>

            {/* Knowledge */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--gold)]" /> Knowledge
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={<BookOpen className="w-4 h-4"/>}       label="Books completed"    value={stats.booksRead}         color="var(--gold)" />
                <StatCard icon={<GraduationCap className="w-4 h-4"/>}  label="Courses completed"  value={stats.coursesCompleted}  color="var(--gold)" />
                <StatCard icon={<NotebookPen className="w-4 h-4"/>}    label="Journal entries"    value={stats.journalEntries}    color="var(--gold)" />
                <StatCard icon={<Heart className="w-4 h-4"/>}          label="Total check-ins"    value={stats.totalCheckins}     color="var(--gold)" />
              </div>
            </section>

            {/* Closing */}
            <div className="rounded-2xl border border-[var(--gold)]/15 bg-[var(--gold-muted)] p-6 text-center">
              <p className="text-lg font-semibold text-[var(--gold)]" style={{ fontFamily: "var(--font-heading)" }}>
                {YEAR} in one number: {stats.totalCheckins} days logged.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Every entry is a day you chose to show up. Keep going.
              </p>
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
