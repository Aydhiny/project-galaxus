"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus, Target, Sparkles, Bot } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MonthlyGoal, Task } from "@/lib/db/schema";
import { createMonthlyGoal } from "@/lib/actions/monthly-goals";
import {
  daysInMonth, expectedProgress, goalPace, goalProgress, monthLabel, nextStep, shiftMonth, todaysSteps, PACE_LABEL, type Pace,
} from "@/lib/goals";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export const PACE_STYLE: Record<Pace, string> = {
  ahead: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "on-track": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  behind: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  achieved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "no-plan": "bg-muted text-muted-foreground",
  "not-started": "bg-muted text-muted-foreground",
};

const GOAL_EMOJIS = ["🎯", "🤸", "💪", "🏃", "📚", "🧠", "🎵", "🎨", "💻", "🕌", "🧘", "💰", "🌱", "✍️", "🗣️", "🚀"];

export interface GoalTaskHandlers {
  toggleDone: (t: Task) => void;
  move: (ids: number[], id: number, dir: -1 | 1) => void;
  drop: (ids: number[], fromId: number, toId: number, position: "above" | "below") => void;
  patchTask: (id: number, patch: Partial<Pick<Task, "dueDate" | "goalId" | "phase">>) => void;
  addTask: (input: { title: string; dueDate: string | null; priority: "none"; goalId: number; phase: string | null }) => void;
}

/**
 * "This month's goals": cards with plan progress + pace, a sheet showing a
 * goal's plan by phase, and a new-goal form. Shared by Tasks + Productivity.
 */
export function GoalsPanel({ goals: initialGoals, tasks, today, compact }: {
  goals: MonthlyGoal[];
  tasks: Task[];
  today: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [prev, setPrev] = useState(initialGoals);
  if (prev !== initialGoals) { setPrev(initialGoals); setGoals(initialGoals); } // server refresh wins

  const month = today.slice(0, 7);
  const [creating, setCreating] = useState(false);

  const thisMonth = goals.filter((g) => g.month === month && g.status !== "abandoned");
  const byGoal = useMemo(() => {
    const m = new Map<number, Task[]>();
    for (const t of tasks) if (t.goalId) m.set(t.goalId, [...(m.get(t.goalId) ?? []), t]);
    return m;
  }, [tasks]);
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10));

  return (
    <section aria-labelledby="goals-title">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="goals-title" className="text-sm font-semibold flex items-center gap-1.5">
          <Target className="w-4 h-4" /> {monthLabel(month).split(" ")[0]} goals
        </h2>
        <span className="text-xs text-muted-foreground">{daysLeft} day{daysLeft === 1 ? "" : "s"} left this month</span>
      </div>

      <div className={cn("grid gap-3", compact ? "grid-cols-1 @xl:grid-cols-2" : "grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3")}>
        {thisMonth.map((g) => {
          const mine = byGoal.get(g.id) ?? [];
          const progress = goalProgress(mine);
          const pace: Pace = g.status === "achieved" ? "achieved" : goalPace(g.month, today, progress, mine);
          const expected = expectedProgress(g.month, today, mine);
          return (
            <Link
              key={g.id}
              href={`/goal/${g.id}`}
              className="block text-left rounded-xl border border-border bg-card p-4 hover:border-foreground/20 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">{g.emoji ?? "🎯"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{g.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {cardLine(mine, today, progress.total)}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", PACE_STYLE[pace])}>{PACE_LABEL[pace]}</span>
              </div>
              {/* Progress bar with a tick at where you "should" be by today */}
              <div className="relative mt-3 h-1.5 rounded-full bg-muted overflow-visible" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress.pct}%` }} />
                {progress.total > 0 && expected > 0 && expected < 100 && (
                  <span className="absolute -top-1 w-0.5 h-3.5 rounded bg-foreground/40" style={{ left: `${expected}%` }} title={`Today's pace: ${expected}%`} />
                )}
              </div>
              <p className="sr-only">{progress.pct}% done, expected {expected}% by today.</p>
            </Link>
          );
        })}

        <button
          onClick={() => setCreating(true)}
          className="rounded-xl border border-dashed border-border p-4 text-left text-sm text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-colors flex items-center gap-3 min-h-[92px]"
        >
          <span className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"><Plus className="w-4 h-4" /></span>
          <span>
            <span className="block font-medium text-foreground">{thisMonth.length === 0 ? "Set a goal for this month" : "Add a goal"}</span>
            <span className="block text-xs">e.g. Learn a handstand, read 4 books</span>
          </span>
        </button>
      </div>

      <NewGoalSheet
        open={creating}
        onOpenChange={setCreating}
        month={month}
        onCreated={(g) => { setGoals((gs) => [...gs, g]); setCreating(false); router.push(`/goal/${g.id}`); }}
      />

    </section>
  );
}

// ─── New goal ───────────────────────────────────────────────────────────────

function NewGoalSheet({ open, onOpenChange, month, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: string;
  onCreated: (g: MonthlyGoal) => void;
}) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [description, setDescription] = useState("");
  const [targetMonth, setTargetMonth] = useState(month);
  const [pending, startTransition] = useTransition();
  const next = shiftMonth(month, 1);

  function create() {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        const g = await createMonthlyGoal({ title, emoji, description: description || null, month: targetMonth });
        setTitle(""); setDescription(""); setEmoji("🎯");
        onCreated(g);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create the goal.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 overflow-y-auto">
        <div className="p-6 pr-12 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-lg"><Sparkles className="w-4 h-4" /> New monthly goal</SheetTitle>
          <SheetDescription className="mt-1">One clear outcome for the month. You&apos;ll break it into steps next — or let your AI plan it.</SheetDescription>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Icon">
            {GOAL_EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e}
                className={cn("w-9 h-9 rounded-lg text-lg", emoji === e ? "bg-accent ring-1 ring-primary" : "hover:bg-accent")}>
                {e}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Goal</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              autoFocus placeholder="Learn a freestanding handstand" className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Why / what “done” looks like <span className="text-muted-foreground font-normal">(optional)</span></span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Hold a 10-second freestanding handstand by Oct 31."
              className="w-full rounded-lg border border-border bg-transparent p-3 text-sm resize-none" />
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Month</span>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
              {[month, next].map((m) => (
                <button key={m} type="button" onClick={() => setTargetMonth(m)} aria-pressed={targetMonth === m}
                  className={cn("px-3 h-8 rounded-md text-sm", targetMonth === m ? "bg-background shadow-xs font-medium" : "text-muted-foreground")}>
                  {monthLabel(m).split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={pending || !title.trim()}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            Create goal
          </button>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Tip: with an AI assistant connected (<Link href="/settings#ai" className="underline underline-offset-2">Settings → AI assistants</Link>) you can just say “make me a handstand plan for October” and it creates the goal and every step.</span>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One line per goal card: what to do today, else when the next step is. */
function cardLine(tasks: Task[], today: string, total: number): string {
  if (total === 0) return "No plan yet";
  const open = todaysSteps(tasks, today).filter((t) => t.status !== "done");
  if (open.length === 1) return `Today: ${open[0].title}`;
  if (open.length > 1) return `Today: ${open[0].title} +${open.length - 1}`;
  const next = nextStep(tasks, today);
  if (!next) return "All steps done 🏆";
  // date-fns, not toLocaleDateString: same output on server and client (no hydration mismatch).
  return `Done for today · next ${format(parseISO(next.dueDate!), "EEE")}`;
}
