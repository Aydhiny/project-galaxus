"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Flame, CheckCircle2, CalendarCheck2, ListTodo, Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/schema";
import { useTasks } from "@/components/tasks/use-tasks";
import { TaskRow } from "@/components/tasks/tasks-view";
import { compareTasks, parseQuickAdd } from "@/lib/tasks";
import { useHydrated, useLocalToday } from "@/lib/hooks/client-values";
import { bestDay, completionStreak, completionsByDay, heatmapWeeks, weekOverWeek, dayKey } from "@/lib/productivity";
import { CompletionsChart } from "@/components/productivity/completions-chart";
import { CompletionHeatmap } from "@/components/productivity/completion-heatmap";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export function ProductivityDashboard({ initialTasks, serverToday }: { initialTasks: Task[]; serverToday: string }) {
  const { tasks, lingering, toggleDone, addTask } = useTasks(initialTasks);
  const today = useLocalToday(serverToday);
  const hydrated = useHydrated();
  const [range, setRange] = useState<Range>(14);
  const [draft, setDraft] = useState("");

  // All stats are day-granular, so a midday Date for the local "today" is
  // enough (and keeps render pure — no new Date() per render).
  const ref = useMemo(() => new Date(today + "T12:00:00"), [today]);
  const series = useMemo(() => completionsByDay(tasks, range, ref), [tasks, range, ref]);
  const heat = useMemo(() => heatmapWeeks(tasks, 18, ref), [tasks, ref]);
  const streak = useMemo(() => completionStreak(tasks, ref), [tasks, ref]);
  const wow = useMemo(() => weekOverWeek(tasks, ref), [tasks, ref]);
  const best = bestDay(series);
  const avg = series.reduce((s, d) => s + d.count, 0) / series.length;

  // Today's plan = open tasks due today or overdue (+ anything just checked,
  // so it stays visible with its checkmark for a moment).
  const plan = tasks
    .filter((t) => (t.status !== "done" || lingering.has(t.id)) && t.dueDate && t.dueDate <= today)
    .sort(compareTasks);
  const doneToday = tasks
    .filter((t) => t.status === "done" && !lingering.has(t.id) && t.completedAt && dayKey(new Date(t.completedAt)) === today)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length;
  const open = tasks.filter((t) => t.status !== "done").length;
  const completedTodayCount = tasks.filter((t) => t.status === "done" && t.completedAt && dayKey(new Date(t.completedAt)) === today).length;
  const planTotal = plan.length + doneToday.length;
  const pct = planTotal === 0 ? 0 : Math.round((doneToday.length / planTotal) * 100);

  function submitDraft() {
    const parsed = parseQuickAdd(draft);
    if (!parsed.title.trim()) return;
    // Added from "Today" → due today unless the text said otherwise.
    addTask({ ...parsed, dueDate: parsed.dueDate ?? today });
    setDraft("");
  }

  return (
    <div className="@container max-w-5xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productivity</h1>
          <p className="text-sm text-muted-foreground mt-1">{hydrated ? format(ref, "EEEE, MMMM d") : " "}</p>
        </div>
        <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          All tasks <ArrowRight className="w-4 h-4" />
        </Link>
      </header>

      {/* ── Stat tiles: the four numbers worth glancing at ───────────────── */}
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        <StatTile icon={CheckCircle2} label="Completed today" value={completedTodayCount} />
        <StatTile
          icon={CalendarCheck2}
          label="Last 7 days"
          value={wow.thisWeek}
          detail={<Trend current={wow.thisWeek} previous={wow.lastWeek} />}
        />
        <StatTile icon={Flame} label="Day streak" value={streak} detail={streak > 0 ? "days in a row" : "finish one task to start"} />
        <StatTile
          icon={ListTodo}
          label="Open tasks"
          value={open}
          detail={overdue > 0 ? <span className="text-red-500">{overdue} overdue</span> : "none overdue"}
        />
      </div>

      <div className="grid gap-6 @3xl:grid-cols-[1.1fr_1fr]">
        {/* ── Today's plan ─────────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Today</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{doneToday.length}/{planTotal} done</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's progress">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border px-3 mb-3 focus-within:border-foreground/25">
            <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitDraft(); }}
              placeholder="Add a task for today…"
              className="flex-1 h-10 bg-transparent border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-sm px-0"
            />
          </div>

          {plan.length === 0 && doneToday.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing due today. Add something above or plan from <Link href="/tasks" className="underline underline-offset-4">Tasks</Link>.</p>
          ) : (
            <div className="divide-y divide-border/70">
              {plan.map((t) => (
                <TaskRow key={t.id} task={t} today={today} justDone={lingering.has(t.id)} onToggle={() => toggleDone(t)} />
              ))}
            </div>
          )}

          {doneToday.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 px-1">Done today · {doneToday.length}</p>
              <div className="divide-y divide-border/70">
                {doneToday.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onToggle={() => toggleDone(t)} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Completions per day ──────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold">Tasks completed per day</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Avg {avg.toFixed(1)}/day{best ? ` · best ${best.count} on ${format(new Date(best.date + "T12:00:00"), "MMM d")}` : ""}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50 shrink-0" role="group" aria-label="Range">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={cn(
                    "px-2.5 h-7 rounded-md text-xs transition-colors tabular-nums",
                    range === r ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
          <CompletionsChart series={series} today={today} />
        </section>
      </div>

      {/* ── Consistency heatmap ────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-semibold">Consistency</h2>
          <span className="text-xs text-muted-foreground">Last 18 weeks</span>
        </div>
        <CompletionHeatmap weeks={heat} />
      </section>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, detail }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  detail?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums mt-2">{value}</p>
      {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
    </div>
  );
}

/** Week-over-week change, with an icon + words so it never relies on color alone. */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span>no activity yet</span>;
  const diff = current - previous;
  if (diff === 0) return <span className="inline-flex items-center gap-1"><Minus className="w-3 h-3" /> same as prior week</span>;
  const up = diff > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
      <Icon className="w-3 h-3" /> {up ? "+" : ""}{diff} vs prior week
    </span>
  );
}
