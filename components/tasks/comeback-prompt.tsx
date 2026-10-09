"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { dismissRemovedTasks, getRemovedForReview, restoreTasks } from "@/lib/actions/tasks";
import { taskPoints, toDateKey } from "@/lib/tasks";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

const ASKED_KEY = "galaxus-comeback-asked";

export interface RemovedTask {
  id: number;
  title: string;
  priority: string;
  deletedAt: Date | null;
}

/**
 * The "guilt trip": the day after you remove unfinished tasks, ask whether
 * you want them back — sweetened with double points. Asked at most once per
 * day ("Ask me later" snoozes until tomorrow); an explicit answer is stored
 * server-side so a task is never asked about twice.
 *
 * Container: loads data and performs the actions. The UI lives in
 * <ComebackDialog/> so it can be rendered/tested with plain props.
 */
export function ComebackPrompt() {
  const router = useRouter();
  const [items, setItems] = useState<RemovedTask[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const today = toDateKey(new Date());
    try { if (localStorage.getItem(ASKED_KEY) === today) return; } catch { /* storage blocked: still ask */ }
    let alive = true;
    getRemovedForReview().then((rows) => {
      if (!alive) return;
      // Only tasks removed BEFORE today (local) — "the next day" — not ones
      // you deleted five minutes ago.
      const due = rows.filter((r) => r.deletedAt && toDateKey(new Date(r.deletedAt)) < today);
      if (due.length === 0) return;
      setItems(due);
      setOpen(true);
    }).catch(() => { /* signed out / offline */ });
    return () => { alive = false; };
  }, []);

  function snooze() {
    try { localStorage.setItem(ASKED_KEY, toDateKey(new Date())); } catch { /* ignore */ }
    setOpen(false);
  }

  function answer(restoreIds: number[]) {
    const today = toDateKey(new Date());
    const letGoIds = items.filter((i) => !restoreIds.includes(i.id)).map((i) => i.id);
    const bonus = items.filter((i) => restoreIds.includes(i.id)).reduce((s, i) => s + taskPoints({ priority: i.priority, restoredAt: new Date() }), 0);
    startTransition(async () => {
      try {
        if (restoreIds.length) await restoreTasks(restoreIds, today);
        if (letGoIds.length) await dismissRemovedTasks(letGoIds);
        snooze();
        if (restoreIds.length) {
          toast.success(`${restoreIds.length} task${restoreIds.length > 1 ? "s" : ""} back on today's list — worth ${bonus} pts.`);
          router.refresh();
        }
      } catch {
        toast.error("Couldn't save your answer. We'll ask again later.");
      }
    });
  }

  return <ComebackDialog open={open} items={items} pending={pending} onSnooze={snooze} onAnswer={answer} />;
}

export function ComebackDialog({ open, items, pending, onSnooze, onAnswer }: {
  open: boolean;
  items: RemovedTask[];
  pending?: boolean;
  onSnooze: () => void;
  /** ids to bring back (empty array = let them all go). */
  onAnswer: (restoreIds: number[]) => void;
}) {
  // Everything pre-selected: the default answer is "yes, bring them back".
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  const chosen = items.filter((i) => !deselected.has(i.id));
  const bonus = chosen.reduce((s, i) => s + taskPoints({ priority: i.priority, restoredAt: new Date() }), 0);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onSnooze(); }}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto sm:mx-0 w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mb-1">
            <Flame className="w-5 h-5" />
          </div>
          <AlertDialogTitle>Giving up on {items.length === 1 ? "this one" : `these ${items.length}`}?</AlertDialogTitle>
          <AlertDialogDescription>
            You removed {items.length === 1 ? "a task" : "some tasks"} without finishing. Bring them back today and
            each one is worth <span className="font-semibold text-foreground">2× points</span> when you complete it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="max-h-64 overflow-y-auto -mx-1 my-1 space-y-1">
          {items.map((i) => {
            const on = !deselected.has(i.id);
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setDeselected((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}
                  aria-pressed={on}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    on ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <span className={cn(
                    "w-[18px] h-[18px] shrink-0 rounded-[5px] border flex items-center justify-center",
                    on ? "bg-primary border-primary text-primary-foreground" : "border-foreground/30"
                  )}>
                    {on && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{i.title}</span>
                  <span className="text-xs tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                    +{taskPoints({ priority: i.priority, restoredAt: new Date() })} pts
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onSnooze} disabled={pending}>Ask me later</Button>
          <Button variant="outline" onClick={() => onAnswer([])} disabled={pending}>Let them go</Button>
          <Button onClick={() => onAnswer(chosen.map((i) => i.id))} disabled={pending || chosen.length === 0}>
            Bring back {chosen.length > 0 ? `${chosen.length} · +${bonus} pts` : ""}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
