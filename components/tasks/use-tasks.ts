"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Task } from "@/lib/db/schema";
import { createTask, updateTask, deleteTask } from "@/lib/actions/tasks";
import type { TaskPriority, TaskStatus } from "@/lib/tasks";

export type TaskPatch = Partial<Pick<Task, "title" | "notes" | "status" | "priority" | "dueDate">>;

/** How long a just-checked task stays in place (struck through) before moving to "Done". */
export const LINGER_MS = 1800;

/**
 * Shared optimistic task state for the Tasks page and the Productivity
 * dashboard. UI updates instantly; the server call runs in a transition and
 * a failure refetches so the screen never lies about what's saved.
 */
export function useTasks(initialTasks: Task[]) {
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
    toast.success(`Completed “${task.title}”`, {
      action: { label: "Undo", onClick: () => markUndone(task) },
      duration: 4000,
    });
  }, [patchTask, markUndone]);

  const toggleDone = useCallback(
    (task: Task) => (task.status === "done" ? markUndone(task) : markDone(task)),
    [markDone, markUndone]
  );

  const addTask = useCallback((input: { title: string; dueDate: string | null; priority: TaskPriority; status?: TaskStatus }) => {
    const tempId = -Date.now();
    const optimistic: Task = {
      id: tempId, userId: 0, title: input.title, notes: null, status: input.status ?? "todo",
      priority: input.priority, dueDate: input.dueDate, pageId: null,
      orderIndex: Number.MAX_SAFE_INTEGER, completedAt: input.status === "done" ? new Date() : null,
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
    setTasks((ts) => ts.filter((t) => t.id !== id));
    startTransition(async () => {
      try { await deleteTask(id); }
      catch { toast.error("Couldn't delete the task."); router.refresh(); }
    });
  }, [router]);

  return { tasks, setTasks, lingering, patchTask, toggleDone, addTask, removeTask };
}
