"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Trophy, AlertTriangle, Undo2, Repeat, Sparkles, CheckCircle2, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/schema";
import { restoreTasks, updateTask } from "@/lib/actions/tasks";
import { taskPoints, toDateKey } from "@/lib/tasks";
import { useLocalToday } from "@/lib/hooks/client-values";
import { CompletionsChart } from "@/components/productivity/completions-chart";
import type { DayCount } from "@/lib/productivity";

const MAX_WEEKS_BACK = 9; // history window loaded by the page (~70 days)

function localKey(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : toDateKey(date);
}

function summarize(tasks: Task[], start: string, end: string, today: string) {
  const inWeek = (k: string | null) => !!k && k >= start && k <= end;
  const completed = tasks.filter((t) => t.status === "done" && inWeek(localKey(t.completedAt)));
  const points = completed.reduce((s, t) => s + taskPoints(t), 0);
  // Due this week (and already in the past), not finished, not removed.
  const slipped = tasks.filter((t) => t.status !== "done" && !t.deletedAt && !!t.dueDate && t.dueDate >= start && t.dueDate <= end && t.dueDate < today);
  const removed = tasks.filter((t) => t.status !== "done" && !t.recurringId && inWeek(localKey(t.deletedAt)));
  const routine = tasks.filter((t) => t.recurringId !== null && !!t.dueDate && t.dueDate >= start && t.dueDate <= end && t.dueDate <= today);
  const routineDone = routine.filter((t) => t.status === "done").length;
  const comebacks = completed.filter((t) => t.restoredAt).length;
  return { completed, points, slipped, removed, routine, routineDone, comebacks };
}

export function TaskWeeklyReview({ tasks, serverToday }: { tasks: Task[]; serverToday: string }) {
  const router = useRouter();
  const today = useLocalToday(serverToday);
  const [offset, setOffset] = useState(0); // 0 = this week, 1 = last week…
  const [pending, startTransition] = useTransition();

  const weekStart = useMemo(
    () => addDays(startOfWeek(new Date(today + "T12:00:00"), { weekStartsOn: 1 }), -7 * offset),
    [today, offset]
  );
  const start = toDateKey(weekStart);
  const end = toDateKey(addDays(weekStart, 6));
  const prevStart = toDateKey(addDays(weekStart, -7));
  const prevEnd = toDateKey(addDays(weekStart, -1));

  const week = useMemo(() => summarize(tasks, start, end, today), [tasks, start, end, today]);
  const prev = useMemo(() => summarize(tasks, prevStart, prevEnd, today), [tasks, prevStart, prevEnd, today]);

  const series: DayCount[] = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const k = toDateKey(d);
    return { date: k, label: format(d, "EEE"), count: week.completed.filter((t) => localKey(t.completedAt) === k).length };
  }), [weekStart, week.completed]);

  const best = series.reduce<DayCount | null>((b, d) => (d.count > (b?.count ?? 0) ? d : b), null);
  const planned = week.completed.length + week.slipped.length + week.removed.length;
  const rate = planned === 0 ? null : Math.round((week.completed.length / planned) * 100);
  const routineRate = week.routine.length === 0 ? null : Math.round((week.routineDone / week.routine.length) * 100);
  const wins = [...week.completed].sort((a, b) => taskPoints(b) - taskPoints(a)).slice(0, 6);

  const label = offset === 0 ? "This week" : offset === 1 ? "Last week" : `${offset} weeks ago`;

  function reschedule(t: Task) {
    startTransition(async () => {
      try { await updateTask(t.id, { dueDate: today }); toast.success(`“${t.title}” moved to today`); router.refresh(); }
      catch { toast.error("Couldn't reschedule."); }
    });
  }
  function bringBack(t: Task) {
    startTransition(async () => {
      try { await restoreTasks([t.id], today); toast.success(`“${t.title}” is back on today — 2× points`); router.refresh(); }
      catch { toast.error("Couldn't bring it back."); }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-6" aria-labelledby="task-review-title">
      {/* Week switcher */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="task-review-title" className="text-lg font-semibold">Tasks · {label}</h2>
          <p className="text-sm text-muted-foreground">{format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => Math.min(MAX_WEEKS_BACK, o + 1))}
            disabled={offset >= MAX_WEEKS_BACK}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={CheckCircle2} label="Completed" value={week.completed.length} delta={week.completed.length - prev.completed.length} />
        <Tile icon={Sparkles} label="Points" value={week.points} delta={week.points - prev.points} />
        <Tile icon={Trophy} label="Follow-through" value={rate === null ? "—" : `${rate}%`} hint="done ÷ (done + slipped + removed)" />
        <Tile icon={Repeat} label="Routines" value={routineRate === null ? "—" : `${routineRate}%`} hint={week.routine.length ? `${week.routineDone}/${week.routine.length} done` : "no routines yet"} />
      </div>

      {/* Per-day chart */}
      <div>
        <p className="text-sm font-medium mb-1">Completed per day</p>
        <p className="text-xs text-muted-foreground mb-3">
          {best ? `Best day: ${format(new Date(best.date + "T12:00:00"), "EEEE")} with ${best.count}.` : "No completions this week yet."}
          {week.comebacks > 0 ? ` You finished ${week.comebacks} comeback task${week.comebacks > 1 ? "s" : ""} for double points.` : ""}
        </p>
        <CompletionsChart series={series} today={today} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Wins */}
        <ReviewList icon={Trophy} title="Wins" tone="emerald" empty="Nothing finished yet — a single task counts.">
          {wins.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{t.title}</span>
              <span className="text-xs tabular-nums text-muted-foreground shrink-0">+{taskPoints(t)}</span>
            </li>
          ))}
        </ReviewList>

        {/* Slipped */}
        <ReviewList icon={AlertTriangle} title="Slipped" tone="red" empty="Nothing slipped. Clean week.">
          {week.slipped.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{t.title}</span>
              <button
                onClick={() => reschedule(t)}
                disabled={pending}
                className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                <Sun className="w-3 h-3" /> Today
              </button>
            </li>
          ))}
        </ReviewList>

        {/* Removed (guilt history) */}
        <ReviewList icon={Undo2} title="Removed" tone="amber" empty="You didn't give up on anything.">
          {week.removed.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-muted-foreground line-through decoration-muted-foreground/40">{t.title}</span>
              <button
                onClick={() => bringBack(t)}
                disabled={pending}
                className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md border border-amber-500/40 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              >
                Bring back · 2×
              </button>
            </li>
          ))}
        </ReviewList>
      </div>
    </section>
  );
}

function Tile({ icon: Icon, label, value, delta, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  delta?: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <p className="text-2xl font-semibold tabular-nums mt-1.5">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {delta !== undefined
          ? delta === 0 ? "same as week before" : <span className={delta > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>{delta > 0 ? "▲ +" : "▼ "}{delta} vs week before</span>
          : hint}
      </p>
    </div>
  );
}

function ReviewList({ icon: Icon, title, tone, empty, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone: "emerald" | "red" | "amber";
  empty: string;
  children: React.ReactNode[];
}) {
  const color = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "red" ? "text-red-500" : "text-amber-600 dark:text-amber-400";
  return (
    <div>
      <p className={cn("flex items-center gap-1.5 text-sm font-semibold mb-2", color)}>
        <Icon className="w-4 h-4" /> {title} <span className="text-xs font-normal text-muted-foreground">{children.length}</span>
      </p>
      {children.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </div>
  );
}
