"use client";

import { useEffect, useState, useTransition } from "react";
import { Repeat, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { RecurringTask } from "@/lib/db/schema";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { createRecurring, deleteRecurring, listRecurring, updateRecurring, ensureRecurringInstances, getRoutineStats } from "@/lib/actions/recurring";
import { PRIORITY_LABEL, TASK_PRIORITIES, WEEKDAY_SHORT, describeDays, formatTime, type RoutineStat, type TaskPriority } from "@/lib/tasks";
import { AREAS, AREA_META, isArea, type Area } from "@/lib/areas";

const PRESETS: { label: string; days: string }[] = [
  { label: "Every day", days: "1111111" },
  { label: "Weekdays", days: "1111100" },
  { label: "Weekends", days: "0000011" },
];

export function RecurringSheet({ open, onOpenChange, today }: { open: boolean; onOpenChange: (o: boolean) => void; today: string }) {
  const [items, setItems] = useState<RecurringTask[] | null>(null);
  const [stats, setStats] = useState<Record<number, RoutineStat>>({});
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState("1111111");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [area, setArea] = useState<Area | null>(null);
  const [pending, startTransition] = useTransition();

  // Load when opened (cheap, and keeps the Tasks page payload small).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listRecurring().then((rows) => { if (alive) setItems(rows); });
    getRoutineStats(today).then((st) => { if (alive) setStats(st); });
    return () => { alive = false; };
  }, [open, today]);

  function toggleDay(i: number) {
    const next = days.split("");
    next[i] = next[i] === "1" ? "0" : "1";
    // Never allow zero days — a routine that never repeats isn't a routine.
    if (next.includes("1")) setDays(next.join(""));
  }

  function add() {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        const row = await createRecurring({ title, time: time || null, days, priority, area });
        setItems((xs) => [...(xs ?? []), row]);
        setTitle("");
        // Create today's instance right away if the routine applies today.
        await ensureRecurringInstances(today);
        toast.success(`Added “${row.title}” · ${describeDays(row.days)}${row.time ? ` at ${formatTime(row.time)}` : ""}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't add the routine.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 overflow-y-auto">
        <div className="p-6 pb-4 pr-12 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-lg"><Repeat className="w-4 h-4" /> Recurring tasks</SheetTitle>
          <SheetDescription className="mt-1">
            Routines appear in your list automatically on the days you pick, at the same time.
          </SheetDescription>
        </div>

        {/* New routine */}
        <div className="p-6 space-y-4 border-b border-border">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="e.g. Read Quran, Gym, Review inbox"
            className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-xs border transition-colors",
                  days === p.days ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Repeat on">
            {WEEKDAY_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i)}
                aria-pressed={days[i] === "1"}
                className={cn(
                  "flex-1 h-9 rounded-md text-xs font-medium transition-colors",
                  days[i] === "1" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {d.slice(0, 2)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-md border border-border bg-transparent px-2 text-sm text-foreground" />
            </label>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
              {TASK_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn("px-2 h-7 rounded-md text-xs", priority === p ? "bg-background shadow-xs font-medium" : "text-muted-foreground")}
                >
                  {p === "none" ? "None" : PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Area of life">
            {AREAS.map((a) => (
              <button key={a} type="button" onClick={() => setArea(area === a ? null : a)} aria-pressed={area === a} title={AREA_META[a].label}
                className={cn("h-8 rounded-md text-sm inline-flex items-center gap-1", area === a ? "px-2 bg-accent ring-1 ring-primary" : "w-8 justify-center hover:bg-accent")}>
                {AREA_META[a].emoji}{area === a && <span className="text-xs">{AREA_META[a].label}</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={pending || !title.trim()}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add routine
          </button>
        </div>

        {/* Existing routines */}
        <div className="p-6">
          <p className="text-xs font-medium text-muted-foreground mb-3">Your routines</p>
          {items === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No routines yet. Add your first one above.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id} className={cn("flex items-center gap-3 rounded-lg border border-border px-3 py-2.5", !r.active && "opacity-55")}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{isArea(r.area) && <span className="mr-1.5">{AREA_META[r.area].emoji}</span>}{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {describeDays(r.days)}{r.time ? ` · ${formatTime(r.time)}` : ""}{r.active ? "" : " · paused"}
                    </p>
                    {stats[r.id] && (stats[r.id].best > 0 || stats[r.id].rate30 !== null) && (
                      <p className="text-xs mt-0.5 tabular-nums">
                        {stats[r.id].streakBefore > 0
                          ? <span className="text-orange-600 dark:text-orange-400 font-medium">🔥 {stats[r.id].streakBefore}-day streak</span>
                          : <span className="text-muted-foreground">No streak yet</span>}
                        <span className="text-muted-foreground">
                          {stats[r.id].best > 0 && ` · best ${stats[r.id].best}`}
                          {stats[r.id].rate30 !== null && ` · ${stats[r.id].rate30}% last 30 days`}
                        </span>
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={r.active}
                    aria-label={r.active ? "Pause routine" : "Resume routine"}
                    onCheckedChange={(v) => {
                      setItems((xs) => xs!.map((x) => (x.id === r.id ? { ...x, active: v } : x)));
                      updateRecurring(r.id, { active: v }).catch(() => toast.error("Couldn't update."));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setItems((xs) => xs!.filter((x) => x.id !== r.id));
                      deleteRecurring(r.id).catch(() => toast.error("Couldn't delete."));
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${r.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Routines are never overdue — a missed day just resets the streak, and a fresh copy shows up next time. Deleting a routine keeps its history.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
