"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Flame, CheckCircle2, Sparkles, ListTodo, Plus, TrendingUp, TrendingDown, Minus, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/schema";
import { useTasks } from "@/components/tasks/use-tasks";
import { SortableTaskList, TaskRow, tomorrowOf } from "@/components/tasks/task-list";
import { compareTasks, parseQuickAdd } from "@/lib/tasks";
import { useHydrated, useLocalToday } from "@/lib/hooks/client-values";
import { bestDay, completionStreak, completionsByDay, heatmapWeeks, mergeHistory, pointsSummary, dayKey, type CompletableTask } from "@/lib/productivity";
import { CompletionsChart } from "@/components/productivity/completions-chart";
import { CompletionHeatmap } from "@/components/productivity/completion-heatmap";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

type HistoryItem = CompletableTask & { id: number };
type PlanDay = "today" | "tomorrow";

export function ProductivityDashboard({ initialTasks, history, serverToday }: {
  initialTasks: Task[];
  history: HistoryItem[];
  serverToday: string;
}) {
  const today = useLocalToday(serverToday);
  const tomorrow = tomorrowOf(today);
  const { tasks, lingering, toggleDone, addTask, patchTask, move, drop } = useTasks(initialTasks, today);
  const hydrated = useHydrated();
  const [range, setRange] = useState<Range>(14);
  const [planDay, setPlanDay] = useState<PlanDay>("today");
  const [draft, setDraft] = useState("");

  // All stats are day-granular, so a midday Date for the local "today" is
  // enough (and keeps render pure — no new Date() per render).
  const ref = useMemo(() => new Date(today + "T12:00:00"), [today]);
  // Live tasks (instant, optimistic) + completed history incl. removed tasks.
  const all = useMemo(() => mergeHistory(tasks, history), [tasks, history]);
  const series = useMemo(() => completionsByDay(all, range, ref), [all, range, ref]);
  const heat = useMemo(() => heatmapWeeks(all, 18, ref), [all, ref]);
  const streak = useMemo(() => completionStreak(all, ref), [all, ref]);
  const points = useMemo(() => pointsSummary(all, ref), [all, ref]);
  const best = bestDay(series);
  const avg = series.reduce((s, d) => s + d.count, 0) / series.length;

  // Plan list: Today = due today or overdue; Tomorrow = due tomorrow.
  // Just-checked tasks linger so the checkmark is visible for a moment.
  const inPlan = (t: Task) => (planDay === "today" ? !!t.dueDate && t.dueDate <= today : t.dueDate === tomorrow);
  const plan = tasks
    .filter((t) => (t.status !== "done" || lingering.has(t.id)) && inPlan(t))
    .sort(compareTasks);
  const doneToday = tasks
    .filter((t) => t.status === "done" && !lingering.has(t.id) && t.completedAt && dayKey(new Date(t.completedAt)) === today)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const tomorrowCount = tasks.filter((t) => t.status !== "done" && t.dueDate === tomorrow).length;
  const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length;
  const open = tasks.filter((t) => t.status !== "done").length;
  const completedTodayCount = all.filter((t) => t.status === "done" && t.completedAt && dayKey(new Date(t.completedAt)) === today).length;
  const planTotal = plan.length + (planDay === "today" ? doneToday.length : 0);
  const pct = planTotal === 0 ? 0 : Math.round((doneToday.length / planTotal) * 100);

  function submitDraft() {
    const parsed = parseQuickAdd(draft);
    if (!parsed.title.trim()) return;
    // Added from the plan card → due on the selected day unless the text said otherwise.
    addTask({ ...parsed, dueDate: parsed.dueDate ?? (planDay === "today" ? today : tomorrow) });
    setDraft("");
  }

  return (
    <div className="@container max-w-5xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productivity</h1>
          <p className="text-sm text-muted-foreground mt-1">{hydrated ? format(ref, "EEEE, MMMM d") : " "}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/review" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <CalendarRange className="w-4 h-4" /> Weekly review
          </Link>
          <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            All tasks <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* ── Stat tiles: the four numbers worth glancing at ───────────────── */}
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        <StatTile
          icon={CheckCircle2}
          label="Completed today"
          value={completedTodayCount}
          detail={points.today > 0 ? `+${points.today} pts today` : "finish one to score"}
        />
        <StatTile
          icon={Sparkles}
          label="Points · 7 days"
          value={points.thisWeek}
          detail={<Trend current={points.thisWeek} previous={points.lastWeek} unit="pts" />}
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
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50" role="tablist" aria-label="Plan for">
              {(["today", "tomorrow"] as const).map((d) => (
                <button
                  key={d}
                  role="tab"
                  aria-selected={planDay === d}
                  onClick={() => setPlanDay(d)}
                  className={cn(
                    "px-3 h-7 rounded-md text-sm capitalize transition-colors",
                    planDay === d ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d}{d === "tomorrow" && tomorrowCount > 0 ? <span className="ml-1 text-xs text-muted-foreground tabular-nums">{tomorrowCount}</span> : null}
                </button>
              ))}
            </div>
            {planDay === "today" && <span className="text-xs text-muted-foreground tabular-nums">{doneToday.length}/{planTotal} done</span>}
          </div>
          {planDay === "today" && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's progress">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-border px-3 mb-3 focus-within:border-foreground/25">
            <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitDraft(); }}
              placeholder={planDay === "today" ? "Add a task for today…" : "Plan something for tomorrow…"}
              className="flex-1 h-10 bg-transparent border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-sm px-0"
            />
          </div>

          {plan.length === 0 && (planDay === "tomorrow" || doneToday.length === 0) ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {planDay === "today" ? "Nothing due today." : "Nothing planned for tomorrow yet."} Add something above, or use the
              <span className="whitespace-nowrap"> ☀︎ / ↗ </span>buttons on any task in <Link href="/tasks" className="underline underline-offset-4">Tasks</Link>.
            </p>
          ) : (
            <SortableTaskList
              className="border-y-0"
              tasks={plan}
              today={today}
              lingering={lingering}
              onToggle={toggleDone}
              onMove={move}
              onDrop={drop}
              onSchedule={(t, d) => patchTask(t.id, { dueDate: d })}
            />
          )}

          {planDay === "today" && doneToday.length > 0 && (
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
function Trend({ current, previous, unit = "" }: { current: number; previous: number; unit?: string }) {
  if (previous === 0 && current === 0) return <span>no activity yet</span>;
  const diff = current - previous;
  const suffix = unit ? ` ${unit}` : "";
  if (diff === 0) return <span className="inline-flex items-center gap-1"><Minus className="w-3 h-3" /> same as prior week</span>;
  const up = diff > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
      <Icon className="w-3 h-3" /> {up ? "+" : ""}{diff}{suffix} vs prior week
    </span>
  );
}
