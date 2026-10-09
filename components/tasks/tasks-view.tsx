"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format, parseISO, subDays } from "date-fns";
import {
  Check, Calendar, Flag, LayoutList, Columns3, Plus, Trash2, CornerDownLeft, CircleDashed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/schema";
import { clearCompletedTasks } from "@/lib/actions/tasks";
import { useTasks } from "@/components/tasks/use-tasks";
import { useLocalToday, useStoredValue } from "@/lib/hooks/client-values";
import {
  BUCKET_LABEL, PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES,
  compareTasks, groupByBucket, parseQuickAdd, toDateKey,
  type DueBucket, type TaskPriority, type TaskStatus,
} from "@/lib/tasks";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type View = "list" | "board";
const VIEW_KEY = "galaxus-tasks-view";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-sky-500",
  none: "text-muted-foreground/50",
};

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-foreground/25",
  doing: "bg-amber-500",
  done: "bg-emerald-500",
};

export function TasksView({ initialTasks, serverToday }: { initialTasks: Task[]; serverToday: string }) {
  const { tasks, setTasks, lingering, patchTask, toggleDone, addTask, removeTask } = useTasks(initialTasks);
  // Saved view comes from localStorage (browser-only); a click overrides it.
  const storedView = useStoredValue(VIEW_KEY);
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view: View = chosenView ?? (storedView === "board" ? "board" : "list");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  // "Today" must be the user's local date, not the server's (UTC).
  const today = useLocalToday(serverToday);
  const [, startTransition] = useTransition();

  function changeView(v: View) {
    setChosenView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }

  // Just-completed tasks are bucketed as if still open so they stay where you
  // clicked (struck through) for a moment, then glide into "Done today".
  const groups = useMemo(
    () => groupByBucket(tasks.map((t) => (lingering.has(t.id) ? { ...t, status: "todo" } : t)), today),
    [tasks, lingering, today]
  );
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const real = (t: Task) => byId.get(t.id) ?? t; // the un-masked task (true status)
  const doneToday = groups.done.filter((t) => t.completedAt && toDateKey(new Date(t.completedAt)) === today);
  const doneEarlier = groups.done.filter((t) => !doneToday.includes(t));
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const dueToday = groups.today.length + groups.overdue.length;
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  return (
    <div className={cn("@container mx-auto px-5 md:px-10 py-8 md:py-12", view === "board" ? "max-w-6xl" : "max-w-4xl")}>
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {openCount === 0 ? "All clear. Nice work." : `${openCount} open · ${dueToday} due today or overdue`}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
          {(["list", "board"] as const).map((v) => {
            const Icon = v === "list" ? LayoutList : Columns3;
            return (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-7 rounded-md text-sm capitalize transition-colors",
                  view === v ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {v}
              </button>
            );
          })}
        </div>
      </header>

      <QuickAdd onAdd={addTask} />

      {view === "list" ? (
        <div className="mt-8 space-y-8">
          {(["overdue", "today", "upcoming", "later"] as DueBucket[]).map((bucket) =>
            groups[bucket].length === 0 ? null : (
              <section key={bucket}>
                <h2 className={cn("text-xs font-semibold mb-1.5 px-1", bucket === "overdue" ? "text-red-500" : "text-muted-foreground")}>
                  {BUCKET_LABEL[bucket]} <span className="font-normal opacity-70 ml-1">{groups[bucket].length}</span>
                </h2>
                <div className="divide-y divide-border/70 border-y border-border/70">
                  {groups[bucket].map((t) => (
                    <TaskRow key={t.id} task={real(t)} today={today} justDone={lingering.has(t.id)} onToggle={() => toggleDone(real(t))} onOpen={() => setOpenId(t.id)} />
                  ))}
                </div>
              </section>
            )
          )}

          {openCount === 0 && groups.done.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-14 text-center">
              <CircleDashed className="w-8 h-8 mx-auto text-muted-foreground/60 mb-3" />
              <p className="font-medium">Nothing on your plate</p>
              <p className="text-sm text-muted-foreground mt-1">Add a task above, e.g. <span className="font-mono text-xs">Finish beat tomorrow !high</span></p>
            </div>
          )}

          {doneToday.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold mb-1.5 px-1 text-emerald-600 dark:text-emerald-400">
                Done today <span className="font-normal opacity-70 ml-1">{doneToday.length}</span>
              </h2>
              <div className="divide-y divide-border/70 border-y border-border/70">
                {doneToday.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onToggle={() => toggleDone(t)} onOpen={() => setOpenId(t.id)} />
                ))}
              </div>
            </section>
          )}

          {doneEarlier.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <button onClick={() => setShowEarlier(!showEarlier)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                  {showEarlier ? "Hide" : "Show"} earlier completed <span className="font-normal opacity-70 ml-1">{doneEarlier.length}</span>
                </button>
                {showEarlier && (
                  <button
                    onClick={() => {
                      setTasks((ts) => ts.filter((t) => t.status !== "done"));
                      startTransition(async () => { await clearCompletedTasks(); });
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear all completed
                  </button>
                )}
              </div>
              {showEarlier && (
                <div className="divide-y divide-border/70 border-y border-border/70">
                  {doneEarlier.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} onToggle={() => toggleDone(t)} onOpen={() => setOpenId(t.id)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <Board
          tasks={tasks}
          today={today}
          onMove={(id, status) => patchTask(id, { status })}
          onOpen={setOpenId}
          onAdd={(status, title) => addTask({ ...parseQuickAdd(title), status })}
        />
      )}

      <Sheet open={openTask !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0">
          {openTask && (
            <TaskDetail
              key={openTask.id}
              task={openTask}
              onPatch={(p) => patchTask(openTask.id, p)}
              onDelete={() => { removeTask(openTask.id); setOpenId(null); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Quick add ──────────────────────────────────────────────────────────────

function QuickAdd({ onAdd }: { onAdd: (t: { title: string; dueDate: string | null; priority: TaskPriority }) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickAdd(value), [value]);

  // "n" anywhere on the page (outside inputs) jumps to quick add.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !["INPUT", "TEXTAREA"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    if (!parsed.title.trim()) return;
    onAdd(parsed);
    setValue("");
  }

  return (
    <div className="rounded-xl border border-border bg-card focus-within:border-foreground/25 transition-colors">
      <div className="flex items-center gap-3 px-4">
        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setValue(""); e.currentTarget.blur(); } }}
          placeholder="Add a task…  try “Gym tomorrow !high”"
          className="flex-1 h-12 bg-transparent border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-[15px] placeholder:text-muted-foreground/60 px-0"
        />
        {!value && <kbd className="hidden sm:block text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">N</kbd>}
        {value && (
          <button onClick={submit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <CornerDownLeft className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>
      {value && (parsed.dueDate || parsed.priority !== "none") && (
        <div className="flex items-center gap-2 px-4 pb-3 -mt-1 text-xs">
          {parsed.dueDate && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
              <Calendar className="w-3 h-3" /> {format(parseISO(parsed.dueDate), "EEE, MMM d")}
            </span>
          )}
          {parsed.priority !== "none" && (
            <span className={cn("inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5", PRIORITY_COLOR[parsed.priority])}>
              <Flag className="w-3 h-3" /> {PRIORITY_LABEL[parsed.priority]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── List row ───────────────────────────────────────────────────────────────

export function DueChip({ date, today, done }: { date: string; today: string; done: boolean }) {
  const overdue = !done && date < today;
  const isToday = date === today;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs tabular-nums whitespace-nowrap",
      overdue ? "text-red-500" : isToday ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
    )}>
      <Calendar className="w-3 h-3" />
      {isToday ? "Today" : format(parseISO(date), "MMM d")}
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
        "w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-all",
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

export function TaskRow({ task, today, onToggle, onOpen, justDone }: {
  task: Task; today: string; onToggle: () => void; onOpen?: () => void; justDone?: boolean;
}) {
  const done = task.status === "done";
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group flex items-center gap-3 px-1 py-2.5 rounded-sm transition-colors duration-300",
        onOpen && "cursor-pointer hover:bg-accent/40",
        task.id < 0 && "opacity-60",
        justDone && "bg-emerald-500/[0.07]"
      )}
    >
      <Checkbox done={done} onToggle={onToggle} priority={task.priority as TaskPriority} />
      <span className={cn("flex-1 min-w-0 truncate text-[15px]", done && "line-through text-muted-foreground")}>{task.title}</span>
      {task.status === "doing" && (
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT.doing)} /> In progress
        </span>
      )}
      {task.notes && <span className="hidden sm:block w-1 h-1 rounded-full bg-muted-foreground/50" title="Has notes" />}
      {task.dueDate && <DueChip date={task.dueDate} today={today} done={done} />}
      {task.priority !== "none" && <Flag className={cn("w-3.5 h-3.5", PRIORITY_COLOR[task.priority as TaskPriority])} />}
    </div>
  );
}

// ─── Board ──────────────────────────────────────────────────────────────────

function Board({ tasks, today, onMove, onOpen, onAdd }: {
  tasks: Task[];
  today: string;
  onMove: (id: number, status: TaskStatus) => void;
  onOpen: (id: number) => void;
  onAdd: (status: TaskStatus, title: string) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);

  return (
    // Container query (not a viewport breakpoint): the board's real width
    // depends on whether the sidebar is open, so it should respond to that.
    <div className="mt-8 grid grid-cols-1 @2xl:grid-cols-3 gap-4 items-start">
      {TASK_STATUSES.map((status) => {
        const all = tasks.filter((t) => t.status === status).sort(compareTasks);
        // The Done column would otherwise grow forever — show the last week only.
        // (Derived from `today`, not Date.now(): render must stay pure.)
        const weekAgo = toDateKey(subDays(new Date(today + "T12:00:00"), 7));
        const col = status === "done"
          ? all
              .filter((t) => !t.completedAt || toDateKey(new Date(t.completedAt)) >= weekAgo)
              .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
          : all;
        const hidden = all.length - col.length;
        return (
          <div
            key={status}
            onDragOver={(e) => { if (dragging !== null) { e.preventDefault(); setOver(status); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null) {
                const t = tasks.find((x) => x.id === dragging);
                if (t && t.status !== status) onMove(dragging, status);
              }
              setDragging(null); setOver(null);
            }}
            className={cn(
              "rounded-xl bg-muted/40 p-2 min-h-40 transition-colors",
              over === status && "bg-accent ring-1 ring-primary/30"
            )}
          >
            <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
              <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[status])} />
              <span className="text-sm font-medium">{STATUS_LABEL[status]}</span>
              <span className="text-xs text-muted-foreground">{col.length}</span>
            </div>
            <div className="space-y-1.5">
              {col.map((t) => (
                <div
                  key={t.id}
                  draggable={t.id > 0}
                  onDragStart={(e) => { setDragging(t.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  onClick={() => onOpen(t.id)}
                  className={cn(
                    "rounded-lg border border-border bg-card px-3 py-2.5 cursor-pointer hover:border-foreground/20 transition-colors",
                    dragging === t.id && "opacity-40"
                  )}
                >
                  <p className={cn("text-sm leading-snug", t.status === "done" && "line-through text-muted-foreground")}>{t.title}</p>
                  {(t.dueDate || t.priority !== "none") && (
                    <div className="flex items-center gap-3 mt-2">
                      {t.dueDate && <DueChip date={t.dueDate} today={today} done={t.status === "done"} />}
                      {t.priority !== "none" && (
                        <span className={cn("inline-flex items-center gap-1 text-xs", PRIORITY_COLOR[t.priority as TaskPriority])}>
                          <Flag className="w-3 h-3" /> {PRIORITY_LABEL[t.priority as TaskPriority]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {hidden > 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">+{hidden} completed earlier (see List view)</p>
              )}
              {adding === status ? (
                <input
                  autoFocus
                  placeholder="Task name…"
                  onKeyDown={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (e.key === "Enter" && v) { onAdd(status, v); e.currentTarget.value = ""; }
                    if (e.key === "Escape") setAdding(null);
                  }}
                  onBlur={() => setAdding(null)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => setAdding(status)}
                  className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="w-4 h-4" /> New
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail sheet ───────────────────────────────────────────────────────────

function TaskDetail({ task, onPatch, onDelete }: {
  task: Task;
  onPatch: (p: Partial<Pick<Task, "title" | "notes" | "status" | "priority" | "dueDate">>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");

  // Text fields save on blur rather than per keystroke — one request per edit
  // session instead of dozens.
  const commitTitle = () => { if (title.trim() && title !== task.title) onPatch({ title: title.trim() }); };
  const commitNotes = () => { if (notes !== (task.notes ?? "")) onPatch({ notes: notes || null }); };

  return (
    <div className="flex flex-col h-full">
      <SheetTitle className="sr-only">Edit task</SheetTitle>
      <div className="p-6 pb-4 pr-12">
        <textarea
          value={title}
          rows={2}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          className="w-full resize-none bg-transparent p-0 border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-xl font-semibold leading-snug"
        />
      </div>

      <div className="px-6 space-y-4 text-sm">
        <Field label="Status">
          <Segmented
            options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], dot: STATUS_DOT[s] }))}
            value={task.status}
            onChange={(v) => onPatch({ status: v as TaskStatus })}
          />
        </Field>
        <Field label="Priority">
          <Segmented
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: p === "none" ? "None" : PRIORITY_LABEL[p] }))}
            value={task.priority}
            onChange={(v) => onPatch({ priority: v as TaskPriority })}
          />
        </Field>
        <Field label="Due date">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => onPatch({ dueDate: e.target.value || null })}
              className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
            />
            {task.dueDate && (
              <button onClick={() => onPatch({ dueDate: null })} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            )}
          </div>
        </Field>
      </div>

      <div className="px-6 pt-6 flex-1 flex flex-col min-h-0">
        <p className="text-xs font-medium text-muted-foreground mb-2">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="Add details, links, sub-steps…"
          className="flex-1 min-h-40 w-full resize-none rounded-lg border border-border bg-transparent p-3 text-sm leading-6"
        />
      </div>

      <div className="p-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {task.createdAt ? `Created ${format(new Date(task.createdAt), "MMM d, yyyy")}` : ""}
        </span>
        <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string; dot?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5 bg-muted/50">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors",
            value === o.value ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.dot && <span className={cn("w-1.5 h-1.5 rounded-full", o.dot)} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
