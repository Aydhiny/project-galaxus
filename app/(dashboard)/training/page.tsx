"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getTrainingPlans,
  getActivePlan,
  addTrainingPlan,
  deleteTrainingPlan,
  setActivePlan,
} from "@/lib/actions/training";
import { getRecentCheckins } from "@/lib/actions/checkin";
import type { TrainingPlan, TrainingExercise } from "@/lib/db/schema";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Dumbbell, Flame, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format, subDays, eachDayOfInterval } from "date-fns";

type PlanWithExercises = TrainingPlan & { exercises: TrainingExercise[] };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function TrainingPage() {
  const [activePlan, setActivePlanState] = useState<PlanWithExercises | null>(null);
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [checkins, setCheckins] = useState<{ date: string; training: boolean | null }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [exercises, setExercises] = useState([
    { name: "", sets: "", reps: "", day: "Monday", weight: "" },
  ]);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const [ap, ps, ck] = await Promise.all([
        getActivePlan(),
        getTrainingPlans(),
        getRecentCheckins(30),
      ]);
      setActivePlanState(ap);
      setPlans(ps);
      setCheckins(ck.map((c) => ({ date: c.date, training: c.training })));
    });
  }

  useEffect(() => { reload(); }, []);

  const last30 = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });
  const trainingDays = new Set(checkins.filter((c) => c.training).map((c) => c.date));

  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    if (trainingDays.has(d)) streak++;
    else break;
  }

  const totalSessions = trainingDays.size;
  const today = format(new Date(), "EEEE");
  const todayExercises = activePlan?.exercises.filter(
    (e) => e.day?.toLowerCase() === today.toLowerCase()
  ) ?? [];

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await addTrainingPlan({
        name: planName,
        description: planDesc,
        exercises: exercises
          .filter((ex) => ex.name.trim())
          .map((ex) => ({
            name: ex.name,
            sets: ex.sets ? Number(ex.sets) : undefined,
            reps: ex.reps || undefined,
            day: ex.day || undefined,
            weight: ex.weight || undefined,
          })),
      });
      toast.success(`Training plan "${planName}" created!`);
      setPlanName(""); setPlanDesc(""); setExercises([{ name: "", sets: "", reps: "", day: "Monday", weight: "" }]);
      setShowAdd(false);
      reload();
    });
  }

  return (
    <div className="page max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label mb-1">Training</p>
          <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Fitness Tracker</h1>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" /> New Plan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="w-4 h-4 text-[var(--gold)]" />
          </div>
          <p className="text-3xl font-bold text-[var(--gold)]">{streak}</p>
          <p className="text-xs text-muted-foreground mt-1">Day streak</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-3xl font-bold">{totalSessions}</p>
          <p className="text-xs text-muted-foreground mt-1">Sessions (30d)</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-3xl font-bold text-[var(--emerald)]">
            {totalSessions > 0 ? Math.round((totalSessions / 30) * 100) : 0}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">Consistency</p>
        </div>
      </div>

      {/* Today's workout */}
      {activePlan && (
        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-[var(--gold)]" />
              Today&apos;s Workout — {today}
            </h2>
            <Badge className="bg-[var(--gold-muted)] text-[var(--gold)] border-[var(--gold)]/30 text-xs">
              {activePlan.name}
            </Badge>
          </div>
          {todayExercises.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Rest day or no exercises scheduled for {today}.
              {trainingDays.has(format(new Date(), "yyyy-MM-dd")) ? " You already trained today! 💪" : " Stay active!"}
            </p>
          ) : (
            <div className="space-y-2">
              {todayExercises.map((ex) => (
                <div key={ex.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/6 bg-white/2">
                  <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.weight && ex.weight]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 30-day training calendar */}
      <div className="glass p-6">
        <h2 className="font-semibold mb-4">30-Day Training History</h2>
        <div className="grid grid-cols-10 gap-1.5">
          {last30.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const trained = trainingDays.has(dateStr);
            const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
            return (
              <div
                key={dateStr}
                title={`${format(day, "MMM d")}: ${trained ? "Trained ✓" : "Rest"}`}
                className={`aspect-square rounded-md transition-all ${
                  isToday ? "ring-1 ring-[var(--gold)] ring-offset-1 ring-offset-background" : ""
                }`}
                style={{
                  background: trained
                    ? "oklch(0.72 0.12 85 / 80%)"
                    : "oklch(1 0 0 / 5%)",
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-white/5" /> <span>Rest</span>
          <div className="w-3 h-3 rounded-sm" style={{ background: "oklch(0.72 0.12 85 / 80%)" }} /> <span>Trained</span>
        </div>
      </div>

      {/* Add plan form */}
      {showAdd && (
        <div className="glass p-6">
          <h2 className="font-semibold mb-5">Create Training Plan</h2>
          <form onSubmit={handleAdd} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="section-label mb-1">Plan Name *</Label>
                <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Push/Pull/Legs" required className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="section-label mb-1">Description</Label>
                <Input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder="Optional description" className="bg-white/5 border-white/10" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="section-label mb-1">Exercises</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setExercises((e) => [...e, { name: "", sets: "", reps: "", day: "Monday", weight: "" }])} className="text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {exercises.map((ex, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <Input
                    value={ex.name}
                    onChange={(e) => setExercises((exs) => exs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Exercise name"
                    className="col-span-4 bg-white/5 border-white/10 text-sm h-9"
                  />
                  <Input
                    value={ex.sets}
                    onChange={(e) => setExercises((exs) => exs.map((x, j) => j === i ? { ...x, sets: e.target.value } : x))}
                    placeholder="Sets"
                    type="number"
                    className="col-span-1 bg-white/5 border-white/10 text-sm h-9"
                  />
                  <Input
                    value={ex.reps}
                    onChange={(e) => setExercises((exs) => exs.map((x, j) => j === i ? { ...x, reps: e.target.value } : x))}
                    placeholder="Reps"
                    className="col-span-2 bg-white/5 border-white/10 text-sm h-9"
                  />
                  <Input
                    value={ex.weight}
                    onChange={(e) => setExercises((exs) => exs.map((x, j) => j === i ? { ...x, weight: e.target.value } : x))}
                    placeholder="Weight"
                    className="col-span-2 bg-white/5 border-white/10 text-sm h-9"
                  />
                  <select
                    value={ex.day}
                    onChange={(e) => setExercises((exs) => exs.map((x, j) => j === i ? { ...x, day: e.target.value } : x))}
                    className="col-span-2 h-9 rounded-lg bg-white/5 border border-white/10 px-2 text-xs text-foreground focus:outline-none"
                  >
                    {DAYS.map((d) => <option key={d} value={d}>{d.slice(0, 3)}</option>)}
                  </select>
                  <button type="button" onClick={() => setExercises((exs) => exs.filter((_, j) => j !== i))} className="col-span-1 text-muted-foreground hover:text-red-400 h-9 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={pending} className="] font-semibold rounded-xl">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Plan"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* All plans */}
      {plans.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm">All Plans</h2>
          {plans.map((plan) => (
            <div key={plan.id} className={`rounded-xl border p-4 flex items-center justify-between ${plan.isActive ? "border-[var(--gold)]/30 bg-[var(--gold-muted)]" : "border-white/6 bg-card"}`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{plan.name}</p>
                  {plan.isActive && <Badge className="] text-[10px]">Active</Badge>}
                </div>
                {plan.description && <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>}
              </div>
              <div className="flex gap-2">
                {!plan.isActive && (
                  <Button size="sm" variant="ghost" onClick={() => startTransition(async () => { await setActivePlan(plan.id); reload(); })} className="text-xs text-[var(--gold)] hover:text-[var(--gold)]">
                    Set Active
                  </Button>
                )}
                <button onClick={() => startTransition(async () => { await deleteTrainingPlan(plan.id); toast.success("Plan deleted"); reload(); })} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
