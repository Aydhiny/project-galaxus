"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Calendar, Check, ChevronDown, ChevronUp, Clock, Flag, GripVertical, Repeat, Sun, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthlyGoal, Task } from "@/lib/db/schema";
import { formatTime, toDateKey, type TaskPriority, type TaskStatus } from "@/lib/tasks";

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-sky-500",
  none: "text-muted-foreground/50",
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-foreground/25",
  doing: "bg-amber-500",
  done: "bg-emerald-500",
};

export function tomorrowOf(today: string): string {
  return toDateKey(addDays(new Date(today + "T12:00:00"), 1));
}

export function DueChip({ date, today, done, className }: { date: string; today: string; done: boolean; className?: string }) {
  const overdue = !done && date < today;
  const isToday = date === today;
  const isTomorrow = date === tomorrowOf(today);
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs tabular-nums whitespace-nowrap",
      className,
      overdue ? "text-red-500" : isToday ? "text-emerald-600 dark:text-emerald-400" : isTomorrow ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
    )}>
      <Calendar className="w-3 h-3" />
      {isToday ? "Today" : isTomorrow ? "Tomorrow" : format(parseISO(date), "MMM d")}
    </span>
  );
}

export function Checkbox({ done, onToggle, priority }: { done: boolean; onToggle: () => void; priority: TaskPriority }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      className={cn(
        // 18px visual, 32px hit area — comfortable for thumbs on iPhone.
        "relative w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-all",
        "before:absolute before:-inset-[7px] before:content-['']",
        done
          ? "bg-emerald-500 border-emerald-500 text-white scale-110"
          : priority === "high" ? "border-red-500/70 hover:bg-red-500/10"
          : priority === "medium" ? "border-amber-500/70 hover:bg-amber-500/10"
          : "border-foreground/30 hover:bg-foreground/[0.05]"
      )}
    >
      {done && <Check className="w-3 h-3" strokeWidth={3} />}
    </button>
  );
}

const iconBtn =
  "w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07] disabled:opacity-30 disabled:pointer-events-none";

export interface TaskRowProps {
  task: Task;
  today: string;
  onToggle: () => void;
  onOpen?: () => void;
  justDone?: boolean;
  /** Reorder controls (omit to hide). */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Schedule quick actions (omit to hide). */
  onSchedule?: (dateKey: string | null) => void;
  /** Drag-and-drop wiring from SortableTaskList. */
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dropIndicator?: "above" | "below" | null;
  /** Monthly goal this task belongs to (shows a small tag). */
  goal?: Pick<MonthlyGoal, "emoji" | "title"> | null;
}

export function TaskRow({ task, today, onToggle, onOpen, justDone, onMoveUp, onMoveDown, onSchedule, dragProps, dropIndicator, goal }: TaskRowProps) {
  const done = task.status === "done";
  const reorderable = !!(onMoveUp || onMoveDown);
  const tomorrow = tomorrowOf(today);
  return (
    <div
      {...dragProps}
      tabIndex={onOpen || reorderable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.altKey && e.key === "ArrowUp" && onMoveUp) { e.preventDefault(); onMoveUp(); }
        else if (e.altKey && e.key === "ArrowDown" && onMoveDown) { e.preventDefault(); onMoveDown(); }
        else if (e.key === "Enter" && onOpen) { e.preventDefault(); onOpen(); }
      }}
      className={cn(
        "group relative flex items-center gap-2.5 pl-1 pr-1 py-2 rounded-sm transition-colors duration-300 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        onOpen && "cursor-pointer hover:bg-accent/40",
        task.id < 0 && "opacity-60",
        justDone && "bg-emerald-500/[0.07]"
      )}
    >
      {dropIndicator === "above" && <div className="absolute left-0 right-0 -top-px h-0.5 rounded bg-primary" />}
      {dropIndicator === "below" && <div className="absolute left-0 right-0 -bottom-px h-0.5 rounded bg-primary" />}

      {reorderable && (
        <span
          aria-hidden
          className="hidden [@media(hover:hover)]:flex w-4 -mr-1 shrink-0 items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      )}

      <Checkbox done={done} onToggle={onToggle} priority={task.priority as TaskPriority} />

      <span className={cn("flex-1 min-w-0 truncate text-[15px]", done && "line-through text-muted-foreground")}>
        {task.title}
      </span>

      {goal && (
        <span className="shrink-0 inline-flex items-center gap-1 max-w-[8rem] rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground" title={`Goal: ${goal.title}`}>
          <span>{goal.emoji ?? "🎯"}</span>
          <span className="hidden xl:inline truncate">{goal.title}</span>
        </span>
      )}
      {task.restoredAt && !done && (
        <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400" title="Brought back — worth double points">
          2×
        </span>
      )}
      {task.recurringId && <Repeat className="hidden sm:block w-3 h-3 shrink-0 text-muted-foreground" aria-label="Recurring" />}
      {task.dueTime && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          <Clock className="w-3 h-3" /> {formatTime(task.dueTime)}
        </span>
      )}
      {task.status === "doing" && (
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT.doing)} /> In progress
        </span>
      )}
      {/* On phones, "Today" just repeats the section heading — give the title the room instead. */}
      {task.dueDate && <DueChip date={task.dueDate} today={today} done={done} className={task.dueDate === today ? "hidden sm:inline-flex" : undefined} />}
      {task.priority !== "none" && <Flag className={cn("w-3.5 h-3.5 shrink-0", PRIORITY_COLOR[task.priority as TaskPriority])} />}

      {/* Row actions: always visible on touch screens, on hover/focus with a mouse */}
      {(reorderable || onSchedule) && !done && (
        <div
          // Touch screens: inline + always visible. Mouse: overlay the row's
          // right edge (fading over the chips) so hidden buttons don't steal
          // width from the title. --row-bg matches the surface behind the row.
          className={cn(
            "flex items-center shrink-0 transition-opacity",
            "[@media(hover:hover)]:absolute [@media(hover:hover)]:inset-y-0 [@media(hover:hover)]:right-0 [@media(hover:hover)]:pl-10 [@media(hover:hover)]:pr-1",
            "[@media(hover:hover)]:bg-[linear-gradient(to_left,var(--row-bg,var(--background))_70%,transparent)]",
            "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {onSchedule && task.dueDate !== today && (
            <button type="button" className={cn(iconBtn, "hidden sm:flex")} onClick={() => onSchedule(today)} aria-label="Do today" title="Do today">
              <Sun className="w-3.5 h-3.5" />
            </button>
          )}
          {onSchedule && task.dueDate !== tomorrow && (
            <button type="button" className={cn(iconBtn, "hidden sm:flex")} onClick={() => onSchedule(tomorrow)} aria-label="Do tomorrow" title="Do tomorrow">
              <Sunrise className="w-3.5 h-3.5" />
            </button>
          )}
          {reorderable && (
            <>
              <button type="button" className={iconBtn} onClick={onMoveUp} disabled={!onMoveUp} aria-label="Move up" title="Move up (Alt+↑)">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button type="button" className={iconBtn} onClick={onMoveDown} disabled={!onMoveDown} aria-label="Move down" title="Move down (Alt+↓)">
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A reorderable list of task rows. Mouse users drag (HTML5 DnD); keyboard
 * users press Alt+↑/↓; touch users (iOS Safari has no HTML5 drag-and-drop)
 * get ↑/↓ buttons. All three funnel into the same onMove/onDrop callbacks.
 */
export function SortableTaskList({
  tasks, today, lingering, realOf, onToggle, onOpen, onMove, onDrop, onSchedule, className, goalsById,
}: {
  tasks: Task[];
  today: string;
  lingering?: Set<number>;
  /** Map a (possibly display-masked) task to the real one. */
  realOf?: (t: Task) => Task;
  onToggle: (t: Task) => void;
  onOpen?: (t: Task) => void;
  onMove: (ids: number[], id: number, dir: -1 | 1) => void;
  onDrop: (ids: number[], fromId: number, toId: number, position: "above" | "below") => void;
  onSchedule?: (t: Task, dateKey: string | null) => void;
  className?: string;
  /** Show a goal tag on tasks linked to one of these goals. */
  goalsById?: Map<number, MonthlyGoal>;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [target, setTarget] = useState<{ id: number; position: "above" | "below" } | null>(null);
  const ids = tasks.map((t) => t.id);
  const real = realOf ?? ((t: Task) => t);

  return (
    <div className={cn("divide-y divide-border/70 border-y border-border/70", className)} onDragEnd={() => { setDragId(null); setTarget(null); }}>
      {tasks.map((t, i) => {
        const rt = real(t);
        return (
          <TaskRow
            key={t.id}
            task={rt}
            today={today}
            justDone={lingering?.has(t.id)}
            onToggle={() => onToggle(rt)}
            onOpen={onOpen ? () => onOpen(rt) : undefined}
            onMoveUp={i > 0 ? () => onMove(ids, t.id, -1) : undefined}
            onMoveDown={i < tasks.length - 1 ? () => onMove(ids, t.id, 1) : undefined}
            onSchedule={onSchedule ? (d) => onSchedule(rt, d) : undefined}
            goal={rt.goalId ? goalsById?.get(rt.goalId) ?? null : null}
            dropIndicator={target?.id === t.id && dragId !== t.id ? target.position : null}
            dragProps={{
              draggable: t.id > 0 && tasks.length > 1,
              onDragStart: (e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; },
              onDragOver: (e) => {
                if (dragId === null || !ids.includes(dragId)) return; // only within this section
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const position = e.clientY < r.top + r.height / 2 ? "above" : "below";
                if (target?.id !== t.id || target.position !== position) setTarget({ id: t.id, position });
              },
              onDrop: (e) => {
                e.preventDefault();
                if (dragId !== null && target) onDrop(ids, dragId, target.id, target.position);
                setDragId(null);
                setTarget(null);
              },
            }}
          />
        );
      })}
    </div>
  );
}
