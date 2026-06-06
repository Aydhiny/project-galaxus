"use client";

import { toggleGoalCompletion } from "@/lib/actions/goals";
import { Target } from "lucide-react";
import { useTransition } from "react";
import type { DailyGoal } from "@/lib/db/schema";

type GoalWithCompletion = DailyGoal & { completed: boolean };

export function QuickGoals({ goals }: { goals: GoalWithCompletion[] }) {
  const [pending, startTransition] = useTransition();

  const done = goals.filter((g) => g.completed).length;
  const pct = goals.length > 0 ? Math.round((done / goals.length) * 100) : 0;

  return (
    <div className="rounded-2xl border border-white/6 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-sm font-semibold">Daily Goals</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {done}/{goals.length} · {pct}%
        </span>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add goals in the Goals section.
        </p>
      ) : (
        <div className="space-y-1.5">
          {goals.map((goal) => (
            <button
              key={goal.id}
              disabled={pending}
              onClick={() =>
                startTransition(() => toggleGoalCompletion(goal.id))
              }
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                goal.completed
                  ? "streak-active text-[var(--gold)]"
                  : "streak-inactive text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="text-base">{goal.emoji}</span>
              <span className="flex-1 font-medium">{goal.title}</span>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                  goal.completed
                    ? "border-[var(--gold)] bg-[var(--gold)]/20"
                    : "border-white/15"
                }`}
              >
                {goal.completed && (
                  <span className="text-[8px] text-[var(--gold)] font-bold">
                    ✓
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
