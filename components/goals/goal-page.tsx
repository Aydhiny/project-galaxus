"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, CalendarDays, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MonthlyGoal, Task } from "@/lib/db/schema";
import { deleteMonthlyGoal, updateMonthlyGoal } from "@/lib/actions/monthly-goals";
import { goalPace, goalProgress, groupByPhase, monthLabel, shiftMonth, PACE_LABEL, type Pace } from "@/lib/goals";
import { useTasks } from "@/components/tasks/use-tasks";
import { useLocalToday } from "@/lib/hooks/client-values";
import { SortableTaskList } from "@/components/tasks/task-list";
import { TaskDetail } from "@/components/tasks/task-detail";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PACE_STYLE } from "@/components/goals/goals-panel";

/** A monthly goal as its own page: progress, the plan by phase, actions. */
export function GoalPage({ goal: initialGoal, initialTasks, goals, serverToday }: {
  goal: MonthlyGoal;
  initialTasks: Task[];
  goals: MonthlyGoal[];
  serverToday: string;
}) {
  const router = useRouter();
  const today = useLocalToday(serverToday);
  const [goal, setGoal] = useState(initialGoal);
  const { tasks, lingering, toggleDone, move, drop, patchTask, addTask, removeTask } = useTasks(initialTasks, today, { goals: [goal] });
  // New steps created here belong to this goal; hide anything moved elsewhere.
  const mine = useMemo(() => tasks.filter((t) => t.goalId === goal.id), [tasks, goal.id]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const progress = goalProgress(mine);
  const pace: Pace = goal.status === "achieved" ? "achieved" : goalPace(goal.month, today, progress, mine);
  const phases = groupByPhase(mine);
  const phaseNames = phases.map((p) => p.phase).filter((p): p is string => !!p);
  const openTask = mine.find((t) => t.id === openId) ?? null;

  function update(patch: Parameters<typeof updateMonthlyGoal>[1]) {
    setGoal((g) => ({ ...g, ...patch }) as MonthlyGoal);
    startTransition(async () => {
      try { await updateMonthlyGoal(goal.id, patch); } catch { toast.error("Couldn't save the goal."); }
    });
  }

  function addStep() {
    const title = draft.trim();
    if (!title) return;
    const due = today.slice(0, 7) === goal.month ? today : `${goal.month}-01`;
    addTask({ title, dueDate: due, priority: "none", goalId: goal.id, phase: phase.trim() || null, area: goal.area });
    setDraft("");
  }

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Tasks
      </Link>

      <header className="flex items-start gap-4">
        <span className="text-5xl leading-none">{goal.emoji ?? "🎯"}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{goal.title}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> {monthLabel(goal.month)}
          </p>
        </div>
      </header>
      {goal.description && <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">{goal.description}</p>}

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground tabular-nums">{progress.done}/{progress.total} steps · {progress.pct}%</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PACE_STYLE[pace])}>{PACE_LABEL[pace]}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      <div className="mt-8 space-y-7">
        {mine.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm">
            <p className="font-medium flex items-center gap-2"><Bot className="w-4 h-4" /> Let your AI build the plan</p>
            <p className="text-muted-foreground mt-1">
              Connect an assistant in <Link href="/settings#ai" className="underline underline-offset-4">Settings → AI assistants</Link> and ask it to plan this goal — or add steps below.
            </p>
          </div>
        )}

        {phases.map((p) => (
          <section key={p.phase ?? "_none"}>
            <h2 className="text-xs font-semibold text-muted-foreground mb-1.5 px-1">
              {p.phase ?? "Other steps"} <span className="font-normal opacity-70 ml-1">{p.tasks.filter((t) => t.status === "done").length}/{p.tasks.length}</span>
            </h2>
            <SortableTaskList
              tasks={p.tasks}
              today={today}
              lingering={lingering}
              onToggle={toggleDone}
              onOpen={(t) => setOpenId(t.id)}
              onMove={move}
              onDrop={drop}
              onSchedule={(t, d) => patchTask(t.id, { dueDate: d })}
            />
          </section>
        ))}

        <div className="rounded-xl border border-border p-3 space-y-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addStep(); }}
            placeholder="Add a step…"
            className="w-full h-9 bg-transparent border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-sm px-1"
          />
          <div className="flex items-center gap-2">
            <input
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              list={`phases-${goal.id}`}
              placeholder="Phase (optional)"
              className="flex-1 h-8 rounded-md border border-border bg-transparent px-2 text-xs"
            />
            <datalist id={`phases-${goal.id}`}>{phaseNames.map((n) => <option key={n} value={n} />)}</datalist>
            <button onClick={addStep} disabled={!draft.trim()} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">Add</button>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-border flex flex-wrap items-center gap-2">
        {goal.status !== "achieved" ? (
          <button onClick={() => { update({ status: "achieved" }); toast.success("Goal achieved — well done! 🏆"); }} disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-emerald-500/40 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
            <Trophy className="w-4 h-4" /> Mark achieved
          </button>
        ) : (
          <button onClick={() => update({ status: "active" })} disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground">
            Reopen goal
          </button>
        )}
        <button onClick={() => update({ month: shiftMonth(goal.month, 1) })} disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground">
          Move to {monthLabel(shiftMonth(goal.month, 1)).split(" ")[0]}
        </button>
        <span className="flex-1" />
        {confirmDelete ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
            Delete
            <button className="underline" onClick={() => startTransition(async () => { await deleteMonthlyGoal(goal.id, false); router.push("/tasks"); })}>goal only</button>
            or
            <button className="underline text-destructive" onClick={() => startTransition(async () => { await deleteMonthlyGoal(goal.id, true); router.push("/tasks"); })}>goal + steps</button>?
            <button className="text-muted-foreground ml-1" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 h-9 px-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        )}
      </div>

      <Sheet open={openTask !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 overflow-y-auto">
          {openTask && (
            <TaskDetail
              key={openTask.id}
              task={openTask}
              today={today}
              goals={goals}
              onPatch={(p) => patchTask(openTask.id, p)}
              onDelete={() => { removeTask(openTask.id); setOpenId(null); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
