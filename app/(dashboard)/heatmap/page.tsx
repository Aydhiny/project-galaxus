"use client";

import { useState, useEffect } from "react";
import { getRecentCheckins } from "@/lib/actions/checkin";
import type { DailyCheckin } from "@/lib/db/schema";
import { Moon, Dumbbell, Sparkles, Music2, Heart, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, eachDayOfInterval } from "date-fns";

interface HabitConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  getValue: (row: DailyCheckin) => boolean;
}

const HABITS: HabitConfig[] = [
  {
    key: "prayers",
    label: "Prayers (5/5)",
    icon: <Moon className="w-3.5 h-3.5" />,
    color: "bg-[var(--emerald)]",
    getValue: (r) =>
      !!(r.fajr && r.dhuhr && r.asr && r.maghrib && r.isha),
  },
  {
    key: "training",
    label: "Training",
    icon: <Dumbbell className="w-3.5 h-3.5" />,
    color: "bg-orange-500",
    getValue: (r) => !!r.training,
  },
  {
    key: "meditation",
    label: "Meditation",
    icon: <Sparkles className="w-3.5 h-3.5" />,
    color: "bg-purple-500",
    getValue: (r) => !!r.meditation,
  },
  {
    key: "music",
    label: "Music",
    icon: <Music2 className="w-3.5 h-3.5" />,
    color: "bg-blue-500",
    getValue: (r) => !!r.music,
  },
  {
    key: "gratitude",
    label: "Gratitude",
    icon: <Heart className="w-3.5 h-3.5" />,
    color: "bg-rose-500",
    getValue: (r) => !!r.gratitude,
  },
  {
    key: "writing",
    label: "Writing",
    icon: <PenLine className="w-3.5 h-3.5" />,
    color: "bg-[var(--gold)]",
    getValue: (r) => !!r.writing,
  },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildGrid(checkins: DailyCheckin[]) {
  const today = new Date();
  const start = subDays(today, 364);
  const days = eachDayOfInterval({ start, end: today });

  const byDate: Record<string, DailyCheckin> = {};
  for (const row of checkins) {
    byDate[row.date] = row;
  }

  return days.map((d) => {
    const dateStr = format(d, "yyyy-MM-dd");
    return { date: d, dateStr, row: byDate[dateStr] ?? null };
  });
}

function calcStreak(grid: ReturnType<typeof buildGrid>, getValue: (r: DailyCheckin) => boolean) {
  let streak = 0;
  for (let i = grid.length - 1; i >= 0; i--) {
    const { row } = grid[i];
    if (row && getValue(row)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function calcTotal(grid: ReturnType<typeof buildGrid>, getValue: (r: DailyCheckin) => boolean) {
  return grid.filter(({ row }) => row && getValue(row)).length;
}

export default function HeatmapPage() {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentCheckins(365).then((data) => {
      setCheckins(data);
      setLoading(false);
    });
  }, []);

  const grid = buildGrid(checkins);
  const year = new Date().getFullYear();

  // Build week columns (each column = 7 cells = 1 week, Sun-Sat)
  // Pad start so first day aligns with its day-of-week
  const padStart = grid[0]?.date.getDay() ?? 0;
  const cells = [
    ...Array.from({ length: padStart }, () => null),
    ...grid,
  ];
  const weeks: (typeof grid[0] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7) as (typeof grid[0] | null)[]);
  }

  // Month label positions
  const monthLabels: { month: number; weekIndex: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstReal = week.find((c) => c !== null);
    if (firstReal) {
      const m = firstReal.date.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ month: m, weekIndex: wi });
        lastMonth = m;
      }
    }
  });

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Progress</p>
        <h1 className="text-xl font-bold mt-0.5">Habit Heatmap</h1>
        <p className="text-sm text-muted-foreground mt-1">{year} — last 365 days</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
          Loading heatmap…
        </div>
      ) : (
        <div className="space-y-6">
          {HABITS.map((habit) => {
            const streak = calcStreak(grid, habit.getValue);
            const total = calcTotal(grid, habit.getValue);

            return (
              <div key={habit.key} className="rounded-2xl border border-white/6 bg-card p-5 space-y-3">
                {/* Habit header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg text-white/80", habit.color + "/20")}>
                      {habit.icon}
                    </div>
                    <span className="text-sm font-semibold">{habit.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Streak:{" "}
                      <span className="font-semibold text-foreground">{streak}d</span>
                    </span>
                    <span>
                      Total:{" "}
                      <span className="font-semibold text-foreground">{total}</span> days
                    </span>
                  </div>
                </div>

                {/* Grid */}
                <div className="overflow-x-auto pb-1">
                  <div className="inline-block min-w-max">
                    {/* Month labels row */}
                    <div className="flex mb-1" style={{ gap: "2px" }}>
                      {weeks.map((_, wi) => {
                        const label = monthLabels.find((m) => m.weekIndex === wi);
                        return (
                          <div key={wi} className="w-[10px] text-[8px] text-muted-foreground truncate">
                            {label ? MONTHS[label.month] : ""}
                          </div>
                        );
                      })}
                    </div>

                    {/* Week columns */}
                    <div className="flex" style={{ gap: "2px" }}>
                      {weeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col" style={{ gap: "2px" }}>
                          {week.map((cell, di) => {
                            if (!cell) {
                              return <div key={di} className="w-[10px] h-[10px]" />;
                            }
                            const done = cell.row ? habit.getValue(cell.row) : false;
                            return (
                              <div
                                key={di}
                                title={`${format(cell.date, "MMM d, yyyy")} — ${done ? "Done" : "Not done"}`}
                                className={cn(
                                  "w-[10px] h-[10px] rounded-[2px] transition-colors",
                                  done
                                    ? cn(habit.color, "opacity-80")
                                    : "bg-white/8"
                                )}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
