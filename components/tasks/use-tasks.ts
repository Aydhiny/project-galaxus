"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MonthlyGoal, Task } from "@/lib/db/schema";
import { celebrationFor } from "@/lib/celebrate";
import { fireConfetti } from "@/lib/confetti";
import { createTask, updateTask, deleteTask, reorderTasks } from "@/lib/actions/tasks";
import { ensureRecurringInstances } from "@/lib/actions/recurring";
import { moveInList, moveTo, type RoutineStat, type TaskPriority, type TaskStatus } from "@/lib/tasks";

export type TaskPatch = Partial<Pick<Task, "title" | "notes" | "status" | "priority" | "dueDate" | "dueTime" | "goalId" | "phase" | "area" | "attachments">>;

/** How long a just-checked task stays in place (struck through) before moving to "Done". */
export const LINGER_MS = 1800;

/**
 * Shared optimistic task state for the Tasks page and the Productivity
 * dashboard. UI updates instantly; the server call runs in a transition and
 * a failure refetches so the screen never lies about what's saved.
 */
export function useTasks(initialTasks: Task[], today: string, opts: { goals?: MonthlyGoal[] } = {}) {
  const goals = opts.goals;
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  // Server data wins whenever it changes (after revalidation / router.refresh).
  // "Adjust state during render" instead of an effect: no extra render pass.
  const [prevInitial, setPrevInitial] = useState(initialTasks);
  if (prevInitial !== initialTasks) {
    setPrevInitial(initialTasks);
    setTasks(initialTasks);
  }
  // Tasks completed in the last moment — kept visually in place so you SEE
  // the checkmark land, instead of the row vanishing the instant you click.
  const [lingering, setLingering] = useState<Set<number>>(() => new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [, startTransition] = useTransition();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Create today's recurring tasks for the viewer's local date. The action
  // revalidates the page when it changes anything, which flows back in via
  // initialTasks above. Once per day per mount.
  const ensuredFor = useRef<string | null>(null);
  // Routine streaks up to yesterday; rows add today live when it's ticked.
  const [streaks, setStreaks] = useState<Record<number, RoutineStat>>({});
  useEffect(() => {
    if (ensuredFor.current === today) return;
    ensuredFor.current = today;
    ensureRecurringInstances(today)
      .then((r) => {
        setStreaks(r.streaks);
        // Say what moved, so a shifted plan is never a surprise.
        for (const g of r.rescheduled) {
          toast(`${g.emoji ?? "🎯"} ${g.title}: missed step moved to today`, {
            description: g.packed
              ? `The month is ending, so ${g.moved} step${g.moved === 1 ? "" : "s"} now share the days left — still all in this month.`
              : `${g.moved} step${g.moved === 1 ? "" : "s"} shifted ${g.days} day${g.days === 1 ? "" : "s"} later — no pile-up.`,
          });
        }
      })
      .catch(() => { /* offline / signed out — try next load */ });
  }, [today]);

  const patchTask = useCallback((id: number, patch: TaskPatch) => {
    setTasks((ts) =>
      ts.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        // Mirror the server's completedAt rule locally so stats update instantly.
        if (patch.status !== undefined) next.completedAt = patch.status === "done" ? new Date() : null;
        return next;
      })
    );
    startTransition(async () => {
      try {
        await updateTask(id, patch as Parameters<typeof updateTask>[1]);
      } catch {
        toast.error("Couldn't save that change.");
        router.refresh();
      }
    });
  }, [router]);

  const markUndone = useCallback((task: Task) => {
    const existing = timers.current.get(task.id);
    if (existing) clearTimeout(existing);
    timers.current.delete(task.id);
    setLingering((s) => { const n = new Set(s); n.delete(task.id); return n; });
    patchTask(task.id, { status: "todo" });
  }, [patchTask]);

  // Defined after markUndone so the toast's Undo can call it (a callback that
  // references itself is flagged by the React Compiler lint rules).
  const markDone = useCallback((task: Task) => {
    patchTask(task.id, { status: "done" });
    const existing = timers.current.get(task.id);
    if (existing) clearTimeout(existing);
    setLingering((s) => new Set(s).add(task.id));
    timers.current.set(task.id, setTimeout(() => {
      setLingering((s) => { const n = new Set(s); n.delete(task.id); return n; });
      timers.current.delete(task.id);
    }, LINGER_MS));
    // Bigger moments for harder / more meaningful tasks (see lib/celebrate.ts).
    const goal = task.goalId ? goals?.find((g) => g.id === task.goalId) ?? null : null;
    const isDone = (t: Task) => t.status === "done" || t.id === task.id;
    const goalTasks = task.goalId ? tasks.filter((t) => t.goalId === task.goalId) : [];
    const phaseTasks = task.phase ? goalTasks.filter((t) => t.phase === task.phase) : [];
    const c = celebrationFor(task, {
      goal,
      goalDone: goalTasks.filter(isDone).length,
      goalTotal: goalTasks.length,
      phaseDone: phaseTasks.filter(isDone).length,
      phaseTotal: phaseTasks.length,
    });
    toast.success(c.title, {
      description: c.description,
      action: { label: "Undo", onClick: () => markUndone(task) },
      duration: c.confetti === "big" ? 7000 : c.confetti === "small" ? 5000 : 4000,
    });
    void fireConfetti(c.confetti);
  }, [patchTask, markUndone, tasks, goals]);

  const toggleDone = useCallback(
    (task: Task) => (task.status === "done" ? markUndone(task) : markDone(task)),
    [markDone, markUndone]
  );

  /** Persist a section's new top-to-bottom order (optimistic). */
  const applyOrder = useCallback((orderedIds: number[]) => {
    const ids = orderedIds.filter((id) => id > 0); // skip unsaved optimistic rows
    const pos = new Map(ids.map((id, i) => [id, i]));
    setTasks((ts) => ts.map((t) => (pos.has(t.id) ? { ...t, orderIndex: pos.get(t.id)! } : t)));
    startTransition(async () => {
      try { await reorderTasks(ids); }
      catch { toast.error("Couldn't save the new order."); router.refresh(); }
    });
  }, [router]);

  /** Move a task one step up/down within the given section list. */
  const move = useCallback((sectionIds: number[], id: number, dir: -1 | 1) => {
    const next = moveInList(sectionIds, id, dir);
    if (next !== sectionIds) applyOrder(next);
  }, [applyOrder]);

  /** Drag-and-drop drop within a section. */
  const drop = useCallback((sectionIds: number[], fromId: number, toId: number, position: "above" | "below") => {
    const next = moveTo(sectionIds, fromId, toId, position);
    if (next !== sectionIds) applyOrder(next);
  }, [applyOrder]);

  const addTask = useCallback((input: { title: string; dueDate: string | null; priority: TaskPriority; status?: TaskStatus; goalId?: number | null; phase?: string | null; area?: string | null }) => {
    const tempId = -Date.now();
    const optimistic: Task = {
      id: tempId, userId: 0, title: input.title, notes: null, status: input.status ?? "todo",
      priority: input.priority, dueDate: input.dueDate, dueTime: null, pageId: null, recurringId: null,
      goalId: input.goalId ?? null, phase: input.phase ?? null, area: input.area ?? null, attachments: [], youtubeIdeaId: null,
      orderIndex: Number.MAX_SAFE_INTEGER, completedAt: input.status === "done" ? new Date() : null,
      deletedAt: null, deletionReviewedAt: null, restoredAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    setTasks((ts) => [...ts, optimistic]);
    startTransition(async () => {
      try {
        const row = await createTask(input);
        setTasks((ts) => ts.map((t) => (t.id === tempId ? row : t)));
      } catch {
        setTasks((ts) => ts.filter((t) => t.id !== tempId));
        toast.error("Couldn't add the task.");
      }
    });
  }, []);

  const removeTask = useCallback((id: number) => {
    const task = tasks.find((t) => t.id === id);
    setTasks((ts) => ts.filter((t) => t.id !== id));
    startTransition(async () => {
      try { await deleteTask(id); }
      catch { toast.error("Couldn't delete the task."); router.refresh(); }
    });
    if (task && task.status !== "done") {
      toast("Task removed", { description: "It's kept in your history — we'll ask tomorrow if you want it back for 2× points." });
    }
  }, [router, tasks]);

  return { tasks, setTasks, lingering, streaks, patchTask, toggleDone, addTask, removeTask, move, drop };
}
