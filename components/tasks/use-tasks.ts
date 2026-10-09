"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Task } from "@/lib/db/schema";
import { createTask, updateTask, deleteTask, reorderTasks } from "@/lib/actions/tasks";
import { ensureRecurringInstances } from "@/lib/actions/recurring";
import { moveInList, moveTo, taskPoints, type TaskPriority, type TaskStatus } from "@/lib/tasks";

export type TaskPatch = Partial<Pick<Task, "title" | "notes" | "status" | "priority" | "dueDate" | "dueTime">>;

/** How long a just-checked task stays in place (struck through) before moving to "Done". */
export const LINGER_MS = 1800;

/**
 * Shared optimistic task state for the Tasks page and the Productivity
 * dashboard. UI updates instantly; the server call runs in a transition and
 * a failure refetches so the screen never lies about what's saved.
 */
export function useTasks(initialTasks: Task[], today: string) {
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
  useEffect(() => {
    if (ensuredFor.current === today) return;
    ensuredFor.current = today;
    ensureRecurringInstances(today).catch(() => { /* offline / signed out — try next load */ });
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
    const pts = taskPoints(task);
    toast.success(`Completed “${task.title}” · +${pts} pt${pts === 1 ? "" : "s"}${task.restoredAt ? " (2× comeback)" : ""}`, {
      action: { label: "Undo", onClick: () => markUndone(task) },
      duration: 4000,
    });
  }, [patchTask, markUndone]);

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

  const addTask = useCallback((input: { title: string; dueDate: string | null; priority: TaskPriority; status?: TaskStatus }) => {
    const tempId = -Date.now();
    const optimistic: Task = {
      id: tempId, userId: 0, title: input.title, notes: null, status: input.status ?? "todo",
      priority: input.priority, dueDate: input.dueDate, dueTime: null, pageId: null, recurringId: null,
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

  return { tasks, setTasks, lingering, patchTask, toggleDone, addTask, removeTask, move, drop };
}
