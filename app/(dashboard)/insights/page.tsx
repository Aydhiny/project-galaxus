"use client";

import { useEffect, useState } from "react";
import { getRecentCheckins } from "@/lib/actions/checkin";
import type { DailyCheckin } from "@/lib/db/schema";
import { loadMoods, moodColor, type MoodEntry } from "@/lib/utils/mood";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Moon, Dumbbell, Music2, Sparkles, NotebookPen, BedDouble,
  TrendingUp, TrendingDown, Minus, Lightbulb, BarChart3,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface DayData {
  checkin: DailyCheckin;
  mood: number;
}

interface Correlation {
  label: string;
  icon: React.ReactNode;
  color: string;
  withLabel: string;
  withoutLabel: string;
  withAvg: number;
  withoutAvg: number;
  withCount: number;
  withoutCount: number;
  delta: number;
}

interface CrossHabit {
  label: string;
  icon: React.ReactNode;
  color: string;
  withPct: number;
  withoutPct: number;
  withCount: number;
}

// ── Math helpers ───────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

function computeCorrelation(
  days: DayData[],
  habitFn: (c: DailyCheckin) => boolean,
  label: string,
  icon: React.ReactNode,
  color: string,
  withLabel = "With",
  withoutLabel = "Without",
): Correlation {
  const withHabit = days.filter(d => habitFn(d.checkin));
  const withoutHabit = days.filter(d => !habitFn(d.checkin));
  const withAvg = avg(withHabit.map(d => d.mood));
  const withoutAvg = avg(withoutHabit.map(d => d.mood));
  return {
    label, icon, color, withLabel, withoutLabel,
    withAvg, withoutAvg,
    withCount: withHabit.length,
    withoutCount: withoutHabit.length,
    delta: parseFloat((withAvg - withoutAvg).toFixed(1)),
  };
}

function computeCrossHabit(
  checkins: DailyCheckin[],
  condFn: (c: DailyCheckin) => boolean,
  outcomeFn: (c: DailyCheckin) => boolean,
  label: string,
  icon: React.ReactNode,
  color: string,
): CrossHabit {
  const withCond = checkins.filter(condFn);
  const withoutCond = checkins.filter(c => !condFn(c));
  const withPct = withCond.length ? Math.round((withCond.filter(outcomeFn).length / withCond.length) * 100) : 0;
  const withoutPct = withoutCond.length ? Math.round((withoutCond.filter(outcomeFn).length / withoutCond.length) * 100) : 0;
  return { label, icon, color, withPct, withoutPct, withCount: withCond.length };
}

// ── Components ──────────────────────────────────────────────────────────────

function CorrelationCard({ c }: { c: Correlation }) {
  const MIN_DAYS = 5;
  const hasData = c.withCount >= MIN_DAYS && c.withoutCount >= MIN_DAYS;
  const positive = c.delta > 0;
  const neutral = Math.abs(c.delta) < 0.3;

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span style={{ color: c.color }}>{c.icon}</span>
        <p className="font-semibold text-sm">{c.label}</p>
        {hasData && !neutral && (
          <span className={cn("ml-auto text-xs font-bold flex items-center gap-1",
            positive ? "text-[var(--emerald)]" : "text-red-400")}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? "+" : ""}{c.delta} mood
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-xs text-muted-foreground">Not enough data yet — need {MIN_DAYS}+ days in each group.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {[
              { label: c.withLabel, val: c.withAvg, count: c.withCount },
              { label: c.withoutLabel, val: c.withoutAvg, count: c.withoutCount },
            ].map((row, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{row.label} <span className="opacity-50">({row.count}d)</span></span>
                  <span className="font-semibold tabular-nums">{row.val}/10</span>
                </div>
                <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${(row.val / 10) * 100}%`,
                      background: i === 0 ? c.color : "oklch(1 0 0 / 20%)",
                    }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {neutral
              ? "No significant mood difference detected."
              : positive
              ? `Mood averages ${c.delta} pts higher on ${c.withLabel.toLowerCase()} days.`
              : `Mood averages ${Math.abs(c.delta)} pts lower on ${c.withLabel.toLowerCase()} days.`}
          </p>
        </>
      )}
    </div>
  );
}

function CrossHabitCard({ c, condLabel }: { c: CrossHabit; condLabel: string }) {
  const diff = c.withPct - c.withoutPct;
  const positive = diff > 5;
  return (
    <div className="glass p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span style={{ color: c.color }}>{c.icon}</span>
        <p className="font-semibold text-sm leading-tight">{c.label}</p>
      </div>
      <div className="space-y-2">
        {[
          { label: `When ${condLabel}`, val: c.withPct },
          { label: `When not`, val: c.withoutPct },
        ].map((row, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold tabular-nums">{row.val}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
              <div className="h-full rounded-full"
                style={{ width: `${row.val}%`, background: i === 0 && positive ? c.color : "oklch(1 0 0 / 20%)" }} />
            </div>
          </div>
        ))}
      </div>
      {positive && (
        <p className="text-[10px] text-[var(--emerald)]">+{diff}% more likely when {condLabel.toLowerCase()}</p>
      )}
    </div>
  );
}

function SleepBinCard({ bins }: { bins: { label: string; avg: number; count: number }[] }) {
  const max = Math.max(...bins.map(b => b.avg), 1);
  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BedDouble className="w-4 h-4 text-[var(--emerald)]" />
        <p className="font-semibold text-sm">Sleep Duration → Mood</p>
      </div>
      {bins.every(b => b.count === 0) ? (
        <p className="text-xs text-muted-foreground">Log sleep in the Daily Check-in to see this.</p>
      ) : (
        <div className="space-y-2.5">
          {bins.map((b, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.label} <span className="opacity-50">({b.count}d)</span></span>
                <span className="font-semibold tabular-nums">{b.count > 0 ? `${b.avg}/10` : "—"}</span>
              </div>
              {b.count > 0 && (
                <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--emerald)]"
                    style={{ width: `${(b.avg / 10) * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayOfWeekCard({ data }: { data: { day: string; avg: number; count: number }[] }) {
  const valid = data.filter(d => d.count >= 2);
  const best = valid.length ? [...valid].sort((a, b) => b.avg - a.avg)[0] : null;
  const max = Math.max(...data.map(d => d.avg), 1);
  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-[var(--gold)]" />
        <p className="font-semibold text-sm">Mood by Day of Week</p>
        {best && (
          <span className="ml-auto text-xs text-[var(--gold)]">Best: {best.day}</span>
        )}
      </div>
      <div className="flex items-end gap-1.5 h-20">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t-md transition-all"
              style={{
                height: d.count >= 2 ? `${(d.avg / 10) * 100}%` : "4px",
                background: d.avg === max && d.count >= 2 ? "var(--gold)" : "oklch(1 0 0 / 15%)",
                minHeight: "4px",
              }} />
            <span className="text-[9px] text-muted-foreground">{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const DAYS_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [crossHabits, setCrossHabits] = useState<CrossHabit[]>([]);
  const [sleepBins, setSleepBins] = useState<{ label: string; avg: number; count: number }[]>([]);
  const [dowData, setDowData] = useState<{ day: string; avg: number; count: number }[]>([]);
  const [topInsight, setTopInsight] = useState("");
  const [daysAnalyzed, setDaysAnalyzed] = useState(0);

  useEffect(() => {
    Promise.all([getRecentCheckins(365)]).then(([checkins]) => {
      const moods = loadMoods();
      const moodMap = new Map(moods.map((m: MoodEntry) => [m.date, m.mood]));

      // Join checkins with mood — only days where both exist
      const days: DayData[] = checkins
        .filter(c => moodMap.has(c.date))
        .map(c => ({ checkin: c, mood: moodMap.get(c.date)! }));

      setDaysAnalyzed(days.length);

      const allFivePrayers = (c: DailyCheckin) =>
        !!(c.fajr && c.dhuhr && c.asr && c.maghrib && c.isha);

      // Mood correlations
      const corrs: Correlation[] = [
        computeCorrelation(days, c => !!c.training,    "Training → Mood",    <Dumbbell className="w-4 h-4"/>,    "var(--gold)",            "Training days",    "Rest days"),
        computeCorrelation(days, allFivePrayers,        "All 5 Prayers → Mood",<Moon className="w-4 h-4"/>,      "var(--emerald)",         "Full prayer days", "Partial prayer days"),
        computeCorrelation(days, c => !!c.meditation,  "Meditation → Mood",  <Sparkles className="w-4 h-4"/>,    "oklch(0.65 0.20 290)",   "Meditated",        "No meditation"),
        computeCorrelation(days, c => !!c.music,       "Music → Mood",       <Music2 className="w-4 h-4"/>,      "oklch(0.70 0.19 32)",    "Music/production", "No music"),
        computeCorrelation(days, c => !!c.gratitude,   "Gratitude → Mood",   <Heart className="w-4 h-4"/>,       "oklch(0.65 0.18 345)",   "Wrote gratitude",  "No gratitude"),
        computeCorrelation(days, c => !!c.writing,     "Writing → Mood",     <NotebookPen className="w-4 h-4"/>,"oklch(0.62 0.18 25)",    "Writing days",     "No writing"),
      ].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      setCorrelations(corrs);

      // Cross-habit predictors (using all checkins, not mood-filtered)
      const cross: CrossHabit[] = [
        computeCrossHabit(checkins, allFivePrayers,         c => !!c.training,   "Prayers → Training rate",    <Dumbbell className="w-4 h-4"/>,   "var(--gold)"),
        computeCrossHabit(checkins, c => !!c.training,      allFivePrayers,      "Training → Full prayer rate", <Moon className="w-4 h-4"/>,       "var(--emerald)"),
        computeCrossHabit(checkins, c => !!c.training,      c => !!c.music,      "Training → Music rate",      <Music2 className="w-4 h-4"/>,      "oklch(0.70 0.19 32)"),
        computeCrossHabit(checkins, c => !!c.meditation,    c => !!c.gratitude,  "Meditation → Gratitude rate",<Heart className="w-4 h-4"/>,        "oklch(0.65 0.18 345)"),
      ];
      setCrossHabits(cross);

      // Sleep analysis
      const sleepDays = checkins.filter(c => c.sleepHours != null && moodMap.has(c.date));
      const bins = [
        { label: "Under 6h",  fn: (h: number) => h < 6 },
        { label: "6–7h",      fn: (h: number) => h >= 6 && h < 7 },
        { label: "7–8h",      fn: (h: number) => h >= 7 && h < 8 },
        { label: "8h+",       fn: (h: number) => h >= 8 },
      ].map(({ label, fn }) => {
        const matching = sleepDays.filter(c => fn(c.sleepHours!));
        const moods = matching.map(c => moodMap.get(c.date)!);
        return { label, avg: avg(moods), count: moods.length };
      });
      setSleepBins(bins);

      // Day of week
      const dowBuckets: number[][] = Array.from({ length: 7 }, () => []);
      days.forEach(d => {
        const dow = new Date(d.checkin.date + "T12:00").getDay();
        dowBuckets[dow].push(d.mood);
      });
      setDowData(DAYS_ABBR.map((day, i) => ({
        day,
        avg: avg(dowBuckets[i]),
        count: dowBuckets[i].length,
      })));

      // Top insight — biggest positive mood driver with enough data
      const best = corrs.find(c => c.delta > 0.5 && c.withCount >= 5 && c.withoutCount >= 5);
      if (best) {
        setTopInsight(`Your mood is +${best.delta} pts higher on ${best.withLabel.toLowerCase()} days. That's your biggest lever.`);
      } else if (days.length < 10) {
        setTopInsight("Keep logging moods in the Daily Check-in — insights unlock after ~10 days of data.");
      } else {
        setTopInsight("No strong mood driver found yet. More data will sharpen the picture.");
      }

      setLoading(false);
    });
  }, []);

  return (
    <ErrorBoundary label="Insights">
      <div className="page">
        {/* Hero */}
        <div className="glass p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-10"
            style={{ background: "var(--gold)", transform: "translate(30%,-30%)" }} />
          <div className="relative flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--gold-muted)] border border-[var(--gold)]/30 flex items-center justify-center shrink-0">
              <Lightbulb className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-1">
                Habit Insights · {daysAnalyzed} days analysed
              </p>
              <p className="text-sm font-medium leading-relaxed">
                {loading ? "Computing your patterns…" : topInsight}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} rows={3} />)}
          </div>
        ) : (
          <>
            {/* Mood correlations */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
                Habit → Mood correlation
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {correlations.map(c => <CorrelationCard key={c.label} c={c} />)}
              </div>
            </section>

            {/* Sleep */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
                Sleep analysis
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SleepBinCard bins={sleepBins} />
                <DayOfWeekCard data={dowData} />
              </div>
            </section>

            {/* Cross-habit predictors */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
                Cross-habit predictors
              </h2>
              <p className="text-xs text-muted-foreground">
                How one habit predicts another — regardless of mood logging.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {crossHabits.map(c => (
                  <CrossHabitCard key={c.label} c={c}
                    condLabel={c.label.split("→")[0].trim()} />
                ))}
              </div>
            </section>

            {daysAnalyzed < 10 && (
              <div className="rounded-2xl border border-border bg-muted/20 p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  Log your mood daily in the Feed to unlock sharper insights.
                  Currently have {daysAnalyzed} mood-paired days — aim for 30+.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
