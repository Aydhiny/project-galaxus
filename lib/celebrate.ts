// Picks how to celebrate a completed task — the harder or more meaningful the
// task, the bigger the moment. Pure (no DOM), so it's unit-tested; the hook
// shows the toast and fires confetti.

import { taskPoints } from "@/lib/tasks";

export type Confetti = "none" | "small" | "big";

export interface Celebration {
  title: string;
  description?: string;
  confetti: Confetti;
}

export interface CelebrationTask {
  id: number;
  title: string;
  priority: string;
  restoredAt?: Date | string | null;
  goalId?: number | null;
  phase?: string | null;
}

export interface CelebrationContext {
  goal?: { emoji: string | null; title: string } | null;
  /** Goal progress INCLUDING this task. */
  goalDone?: number;
  goalTotal?: number;
  /** This task's phase progress INCLUDING this task. */
  phaseDone?: number;
  phaseTotal?: number;
}

const HARD_LINES = [
  "Big one down 💪",
  "That was the hard one — done.",
  "Heavy lifting complete 🏋️",
  "Tough task, cleared. Respect.",
  "You did the thing you were avoiding 🙌",
];

/** Deterministic per task (no Math.random in render paths / tests). */
const pick = (lines: string[], id: number) => lines[Math.abs(id) % lines.length];

export function celebrationFor(task: CelebrationTask, ctx: CelebrationContext = {}): Celebration {
  const pts = taskPoints(task);
  const ptsLabel = `+${pts} pt${pts === 1 ? "" : "s"}`;
  const goalTag = ctx.goal ? `${ctx.goal.emoji ?? "🎯"} ${ctx.goal.title}` : null;

  // 1. Whole goal plan finished — the biggest moment.
  if (ctx.goal && ctx.goalTotal && ctx.goalDone === ctx.goalTotal) {
    return {
      title: `🏆 ${ctx.goal.title} — plan complete!`,
      description: `All ${ctx.goalTotal} steps done. Open the goal to mark it achieved. ${ptsLabel}`,
      confetti: "big",
    };
  }

  // 2. Finished a phase of a goal plan.
  if (goalTag && task.phase && ctx.phaseTotal && ctx.phaseDone === ctx.phaseTotal && ctx.phaseTotal > 1) {
    return {
      title: `✅ ${task.phase} complete`,
      description: `${goalTag} · ${ctx.goalDone}/${ctx.goalTotal} steps · ${ptsLabel}`,
      confetti: "small",
    };
  }

  // 3. A comeback task (brought back after removal) — double points.
  if (task.restoredAt) {
    return {
      title: "Comeback complete 🔥",
      description: `“${task.title}” · ${ptsLabel} (2× for not giving up)`,
      confetti: "small",
    };
  }

  // 4. High priority — the hard stuff.
  if (task.priority === "high") {
    return {
      title: pick(HARD_LINES, task.id),
      description: goalTag ? `“${task.title}” · ${goalTag} · ${ptsLabel}` : `“${task.title}” · ${ptsLabel}`,
      confetti: "small",
    };
  }

  // 5. A regular step toward a goal.
  if (goalTag && ctx.goalTotal) {
    return {
      title: `Step ${ctx.goalDone}/${ctx.goalTotal} toward ${goalTag}`,
      description: `“${task.title}” · ${ptsLabel}`,
      confetti: "none",
    };
  }

  // 6. Everything else.
  return {
    title: task.priority === "medium" ? `Nice — “${task.title}” done` : `Completed “${task.title}”`,
    description: ptsLabel,
    confetti: "none",
  };
}
