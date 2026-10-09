"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format, parseISO, subDays } from "date-fns";
import {
  Calendar, Flag, LayoutList, Columns3, Plus, CornerDownLeft, CircleDashed, Repeat, } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthlyGoal, Task } from "@/lib/db/schema";
import { GoalsPanel } from "@/components/goals/goals-panel";
import { clearCompletedTasks } from "@/lib/actions/tasks";
import { useTasks } from "@/components/tasks/use-tasks";
import { SortableTaskList, TaskRow, DueChip, PRIORITY_COLOR, STATUS_DOT } from "@/components/tasks/task-list";
import { RecurringSheet } from "@/components/tasks/recurring-sheet";
import { TaskDetail } from "@/components/tasks/task-detail";
import { AREAS, AREA_META, type Area } from "@/lib/areas";
import { useLocalToday, useStoredValue } from "@/lib/hooks/client-values";
import {
  BUCKET_LABEL, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES,
  compareTasks, groupByBucket, parseQuickAdd, toDateKey,
  type DueBucket, type TaskPriority, type TaskStatus,
} from "@/lib/tasks";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// Re-exported for existing imports (productivity dashboard).
export { TaskRow, DueChip };

type View = "list" | "board";
const VIEW_KEY = "galaxus-tasks-view";

export function TasksView({ initialTasks, goals, serverToday }: { initialTasks: Task[]; goals: MonthlyGoal[]; serverToday: string }) {
  // Saved view comes from localStorage (browser-only); a click overrides it.
  const storedView = useStoredValue(VIEW_KEY);
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view: View = chosenView ?? (storedView === "board" ? "board" : "list");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  // "Today" must be the user's local date, not the server's (UTC).
  const today = useLocalToday(serverToday);
  const { tasks, setTasks, lingering, patchTask, toggleDone, addTask, removeTask, move, drop } = useTasks(initialTasks, today, { goals });
  const [recurringOpen, setRecurringOpen] = useState(false);
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  // Secondary filter by area of life — the main view stays time-based.
  const [areaFilter, setAreaFilter] = useState<Area | null>(null);
  // Today first: future sections stay folded until asked for.
  const [showUpcoming, setShowUpcoming] = useState(false);
  const areasInUse = useMemo(() => AREAS.filter((a) => tasks.some((t) => t.area === a && t.status !== "done")), [tasks]);
  const visibleTasks = useMemo(() => (areaFilter ? tasks.filter((t) => t.area === areaFilter) : tasks), [tasks, areaFilter]);
  const [, startTransition] = useTransition();

  function changeView(v: View) {
    setChosenView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }

  // Just-completed tasks are bucketed as if still open so they stay where you
  // clicked (struck through) for a moment, then glide into "Done today".
  const groups = useMemo(
    () => groupByBucket(visibleTasks.map((t) => (lingering.has(t.id) ? { ...t, status: "todo" } : t)), today),
    [visibleTasks, lingering, today]
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
        <div className="flex items-center gap-2">
        <button
          onClick={() => setRecurringOpen(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <Repeat className="w-3.5 h-3.5" /> Recurring
        </button>
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
        </div>
      </header>

      <div className="mb-8">
        <GoalsPanel
          goals={goals}
          tasks={tasks}
          today={today}
        />
      </div>

      <QuickAdd onAdd={addTask} />

      {view === "list" && areasInUse.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by area">
          <AreaChip active={areaFilter === null} onClick={() => setAreaFilter(null)}>All</AreaChip>
          {areasInUse.map((a) => (
            <AreaChip key={a} active={areaFilter === a} onClick={() => setAreaFilter(areaFilter === a ? null : a)}>
              {AREA_META[a].emoji} {AREA_META[a].label}
            </AreaChip>
          ))}
        </div>
      )}

      {view === "list" ? (
        <div className="mt-8 space-y-8">
          {(["overdue", "today", ...(showUpcoming ? ["upcoming", "later"] : [])] as DueBucket[]).map((bucket) =>
            groups[bucket].length === 0 ? null : (
              <section key={bucket}>
                <h2 className={cn("text-xs font-semibold mb-1.5 px-1", bucket === "overdue" ? "text-red-500" : "text-muted-foreground")}>
                  {BUCKET_LABEL[bucket]} <span className="font-normal opacity-70 ml-1">{groups[bucket].length}</span>
                </h2>
                <SortableTaskList
                  tasks={groups[bucket]}
                  realOf={real}
                  today={today}
                  lingering={lingering}
                  onToggle={toggleDone}
                  onOpen={(t) => setOpenId(t.id)}
                  onMove={move}
                  onDrop={drop}
                  onSchedule={(t, d) => patchTask(t.id, { dueDate: d })}
                  goalsById={goalsById}
                />
              </section>
            )
          )}

          {groups.upcoming.length + groups.later.length > 0 && (
            <button
              onClick={() => setShowUpcoming((v) => !v)}
              aria-expanded={showUpcoming}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground px-1"
            >
              {showUpcoming ? "Hide upcoming" : "Show upcoming"} <span className="font-normal opacity-70 ml-1">{groups.upcoming.length + groups.later.length}</span>
            </button>
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

      <RecurringSheet open={recurringOpen} onOpenChange={setRecurringOpen} today={today} />
    </div>
  );
}

// ─── Quick add ──────────────────────────────────────────────────────────────

function QuickAdd({ onAdd }: { onAdd: (t: { title: string; dueDate: string | null; priority: TaskPriority; area: Area | null }) => void }) {
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
          placeholder="Add a task…  try “Gym tomorrow !high #training”"
          className="flex-1 h-12 bg-transparent border-0 shadow-none outline-none focus:shadow-none focus-visible:outline-none text-[15px] placeholder:text-muted-foreground/60 px-0"
        />
        {!value && <kbd className="hidden sm:block text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">N</kbd>}
        {value && (
          <button onClick={submit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <CornerDownLeft className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>
      {value && (parsed.dueDate || parsed.priority !== "none" || parsed.area) && (
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
          {parsed.area && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
              {AREA_META[parsed.area].emoji} {AREA_META[parsed.area].label}
            </span>
          )}
        </div>
      )}
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

function AreaChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 px-2.5 rounded-full text-xs transition-colors whitespace-nowrap",
        active ? "bg-foreground text-background font-medium" : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
