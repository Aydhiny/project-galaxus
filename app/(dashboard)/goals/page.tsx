"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getGoals,
  getTodayGoalCompletions,
  addGoal,
  deleteGoal,
  toggleGoalCompletion,
} from "@/lib/actions/goals";
import type { DailyGoal } from "@/lib/db/schema";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GoalWithCompletion = DailyGoal & { completed: boolean };

const CATEGORIES = [
  { id: "spiritual", label: "Spiritual", emoji: "🕌" },
  { id: "health", label: "Health", emoji: "💪" },
  { id: "learning", label: "Learning", emoji: "📚" },
  { id: "creative", label: "Creative", emoji: "🎨" },
  { id: "personal", label: "Personal", emoji: "✨" },
  { id: "general", label: "General", emoji: "✓" },
];

const PRESET_EMOJIS = ["✓", "📖", "🏃", "🧘", "🎵", "✍️", "🙏", "💪", "🎯", "⭐", "🌙", "🕌"];

const DEFAULT_GOALS = [
  { title: "All 5 prayers completed", category: "spiritual", emoji: "🕌" },
  { title: "Read at least 10 pages", category: "learning", emoji: "📖" },
  { title: "30 minutes of exercise", category: "health", emoji: "💪" },
  { title: "10 minutes of meditation", category: "health", emoji: "🧘" },
  { title: "Write or journal", category: "personal", emoji: "✍️" },
  { title: "Practice music/production", category: "creative", emoji: "🎵" },
];

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalWithCompletion[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", category: "general", emoji: "✓" });
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const data = await getTodayGoalCompletions();
      setGoals(data);
    });
  }

  useEffect(() => { reload(); }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await addGoal(form);
      setForm({ title: "", category: "general", emoji: "✓" });
      setShowAdd(false);
      toast.success("Goal added! 🎯");
      reload();
    });
  }

  function handleAddDefaults() {
    startTransition(async () => {
      for (const g of DEFAULT_GOALS) {
        await addGoal(g);
      }
      toast.success("Default goals added!");
      reload();
    });
  }

  const done = goals.filter((g) => g.completed).length;
  const pct = goals.length > 0 ? Math.round((done / goals.length) * 100) : 0;

  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    goals: goals.filter((g) => g.category === cat.id),
  })).filter((cat) => cat.goals.length > 0);

  const uncategorized = goals.filter(
    (g) => !CATEGORIES.find((c) => c.id === g.category)
  );

  return (
    <div className="p-6 space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Goals</p>
          <h1 className="text-xl font-bold mt-0.5">Daily Goals</h1>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" /> Add Goal
        </Button>
      </div>

      {/* Today's progress */}
      {goals.length > 0 && (
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold">Today&apos;s Progress</p>
            <p className="text-2xl font-bold text-[var(--gold)]">
              {done}<span className="text-muted-foreground text-base font-normal">/{goals.length}</span>
            </p>
          </div>
          <div className="h-3 rounded-full bg-white/6 overflow-hidden">
            <div
              className="h-full rounded-full progress-bar transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{pct}% complete</p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-6">
          <h2 className="font-semibold mb-4">New Goal</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Goal Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Read 20 pages"
                required
                className="bg-white/5 border-white/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Category</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest">Emoji</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${
                        form.emoji === e ? "bg-[var(--gold-muted)] border border-[var(--gold)]/40" : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={pending} className="bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[oklch(0.08_0.01_85)] font-semibold rounded-xl">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Goal"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state with defaults */}
      {goals.length === 0 && !showAdd && (
        <div className="text-center py-12 text-muted-foreground space-y-4">
          <Target className="w-12 h-12 mx-auto opacity-20" />
          <div>
            <p className="font-medium">No goals yet</p>
            <p className="text-sm mt-1">Set your daily goals to build powerful habits.</p>
          </div>
          <Button
            onClick={handleAddDefaults}
            disabled={pending}
            variant="outline"
            className="border-[var(--gold)]/30 text-[var(--gold)] hover:bg-[var(--gold-muted)]"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Add recommended goals for me
          </Button>
        </div>
      )}

      {/* Goals by category */}
      {byCategory.map((cat) => (
        <div key={cat.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <span>{cat.emoji}</span>
            <h2 className="text-sm font-semibold">{cat.label}</h2>
          </div>
          <div className="space-y-2">
            {cat.goals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onToggle={() => startTransition(async () => { await toggleGoalCompletion(goal.id); reload(); })}
                onDelete={() => startTransition(async () => { await deleteGoal(goal.id); toast.success("Goal removed"); reload(); })}
              />
            ))}
          </div>
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Other</h2>
          {uncategorized.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onToggle={() => startTransition(async () => { await toggleGoalCompletion(goal.id); reload(); })}
              onDelete={() => startTransition(async () => { await deleteGoal(goal.id); reload(); })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalRow({
  goal,
  onToggle,
  onDelete,
}: {
  goal: GoalWithCompletion;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
      goal.completed ? "streak-active" : "streak-inactive hover:border-white/12"
    }`}>
      <button onClick={onToggle} className="flex items-center gap-3 flex-1 text-left">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          goal.completed ? "border-[var(--gold)] bg-[var(--gold)]" : "border-white/25"
        }`}>
          {goal.completed && <span className="text-[8px] text-[oklch(0.08_0.01_85)] font-bold">✓</span>}
        </div>
        <span className="text-base">{goal.emoji}</span>
        <span className={`text-sm font-medium ${goal.completed ? "text-[var(--gold)]" : "text-foreground"}`}>
          {goal.title}
        </span>
      </button>
      <button onClick={onDelete} className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
