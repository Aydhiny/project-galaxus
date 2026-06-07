"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dumbbell,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Timer,
  ChevronRight,
  Flame,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkoutStep =
  | { kind: "exercise"; label: string; reps: string; restSeconds: number }
  | { kind: "done" };

type Phase = "idle" | "exercise" | "resting" | "complete";

// ─── Workout plans ────────────────────────────────────────────────────────────

const PLAN_A: WorkoutStep[] = [
  { kind: "exercise", label: "Pushups",  reps: "50 reps",  restSeconds: 90 },
  { kind: "exercise", label: "Crunches", reps: "25 reps",  restSeconds: 60 },
  { kind: "exercise", label: "Pushups",  reps: "30 reps",  restSeconds: 90 },
  { kind: "exercise", label: "Crunches", reps: "15 reps",  restSeconds: 60 },
  { kind: "exercise", label: "Pushups",  reps: "20 reps",  restSeconds: 60 },
  { kind: "exercise", label: "Crunches", reps: "10 reps",  restSeconds: 0  },
  { kind: "done" },
];

const PLAN_B: WorkoutStep[] = [
  { kind: "exercise", label: "Pushups + Crunches", reps: "30 + 15 reps", restSeconds: 120 },
  { kind: "exercise", label: "Pushups + Crunches", reps: "30 + 15 reps", restSeconds: 120 },
  { kind: "exercise", label: "Pushups + Crunches", reps: "25 + 10 reps", restSeconds: 90  },
  { kind: "exercise", label: "Pushups + Crunches", reps: "15 + 10 reps", restSeconds: 0   },
  { kind: "done" },
];

const PLANS = [
  { id: "A", name: 'Plan A — "Classic"',    steps: PLAN_A, summary: "100 pushups · 50 crunches" },
  { id: "B", name: 'Plan B — "Supersets"',  steps: PLAN_B, summary: "100 pushups · 50 crunches" },
] as const;

// ─── Web Audio helpers ────────────────────────────────────────────────────────

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // Lazy singleton — avoids creating the context before user gesture
  const win = window as Window & { __galaxusAudioCtx?: AudioContext };
  if (!win.__galaxusAudioCtx) {
    win.__galaxusAudioCtx = new AudioContext();
  }
  return win.__galaxusAudioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  gain = 0.3,
  type: OscillatorType = "sine",
  delaySeconds = 0,
) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.type = type;
  osc.frequency.value = frequency;
  gainNode.gain.setValueAtTime(0, ctx.currentTime + delaySeconds);
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delaySeconds + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + delaySeconds + duration);
  osc.start(ctx.currentTime + delaySeconds);
  osc.stop(ctx.currentTime + delaySeconds + duration + 0.05);
}

function playExerciseStart() {
  playTone(880, 0.18, 0.28, "square");
}

function playCountdownBeep() {
  playTone(660, 0.12, 0.22, "sine");
}

function playRestComplete() {
  playTone(440, 0.18, 0.25, "sine", 0);
  playTone(660, 0.18, 0.25, "sine", 0.22);
}

function playWorkoutComplete() {
  playTone(440, 0.2,  0.3, "sine", 0);
  playTone(550, 0.2,  0.3, "sine", 0.22);
  playTone(660, 0.35, 0.3, "sine", 0.44);
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const [selectedPlanId, setSelectedPlanId] = useState<"A" | "B">("A");
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [paused, setPaused] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

  const plan = PLANS.find((p) => p.id === selectedPlanId)!;
  const steps = plan.steps;

  // Exercise steps only (exclude the terminal "done" sentinel)
  const exerciseSteps = steps.filter((s): s is Extract<WorkoutStep, { kind: "exercise" }> =>
    s.kind === "exercise"
  );
  const totalExerciseSteps = exerciseSteps.length;
  const completedSteps = Math.min(
    stepIndex,
    totalExerciseSteps,
  );

  const progressPercent =
    totalExerciseSteps > 0 ? (completedSteps / totalExerciseSteps) * 100 : 0;

  const currentStep = steps[stepIndex];

  // Keep a ref in sync so the interval closure can read it without stale capture
  pausedRef.current = paused;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startRest = useCallback(
    (seconds: number) => {
      setPhase("resting");
      setCountdown(seconds);
      playRestComplete();

      let remaining = seconds;
      intervalRef.current = setInterval(() => {
        if (pausedRef.current) return;
        remaining -= 1;

        if (remaining <= 3 && remaining > 0) {
          playCountdownBeep();
        }

        if (remaining <= 0) {
          clearTimer();
          // Advance to next exercise step
          setStepIndex((prev) => {
            const next = prev + 1;
            const nextStep = steps[next];
            if (!nextStep || nextStep.kind === "done") {
              setPhase("complete");
              playWorkoutComplete();
              return prev;
            }
            setPhase("exercise");
            setCountdown(0);
            playExerciseStart();
            return next;
          });
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    },
    [clearTimer, steps],
  );

  const handleStart = useCallback(() => {
    // Resume the AudioContext on first user gesture (browser requirement)
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume();

    if (phase === "idle") {
      setStepIndex(0);
      setPhase("exercise");
      setCountdown(0);
      setPaused(false);
      playExerciseStart();
      return;
    }

    if (phase === "exercise" || phase === "resting") {
      setPaused((p) => !p);
    }
  }, [phase]);

  const handleReset = useCallback(() => {
    clearTimer();
    setPhase("idle");
    setStepIndex(0);
    setCountdown(0);
    setPaused(false);
  }, [clearTimer]);

  // When the user presses "Done" after an exercise
  const handleExerciseDone = useCallback(() => {
    clearTimer();
    if (currentStep?.kind !== "exercise") return;

    if (currentStep.restSeconds > 0) {
      startRest(currentStep.restSeconds);
    } else {
      // Last exercise — no rest, finish immediately
      setPhase("complete");
      playWorkoutComplete();
    }
  }, [clearTimer, currentStep, startRest]);

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  // ─── Derived display values ──────────────────────────────────────────────

  const isRunning = phase === "exercise" || phase === "resting";
  const showPauseIcon = isRunning && !paused;

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Workout</p>
          <h1 className="text-xl font-bold mt-0.5 flex items-center gap-2">
            <Flame className="w-5 h-5 text-[var(--gold)]" />
            Home Workout Timer
          </h1>
        </div>
        {phase !== "idle" && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="text-sm font-semibold text-[var(--gold)]">
              {completedSteps} / {totalExerciseSteps}
            </p>
          </div>
        )}
      </div>

      {/* Plan selector — only when idle */}
      {phase === "idle" && (
        <div className="grid grid-cols-2 gap-3">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlanId(p.id)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                selectedPlanId === p.id
                  ? "border-[var(--gold)]/50 bg-[var(--gold-muted)]"
                  : "border-border bg-card hover:border-[var(--gold)]/20"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Dumbbell className="w-4 h-4 text-[var(--gold)] shrink-0" />
                <span className="text-sm font-semibold">{p.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{p.summary}</p>
            </button>
          ))}
        </div>
      )}

      {/* Plan steps overview — only when idle */}
      {phase === "idle" && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4 text-[var(--gold)]" />
            {plan.name} — Steps
          </h2>
          <ol className="space-y-2">
            {exerciseSteps.map((step, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-[var(--gold-muted)] text-[var(--gold)] text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="font-medium flex-1">
                  {step.label} — <span className="text-muted-foreground font-normal">{step.reps}</span>
                </span>
                {step.restSeconds > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {step.restSeconds}s rest
                  </span>
                )}
                {step.restSeconds === 0 && (
                  <span className="text-xs text-[var(--emerald)] shrink-0">finish</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Active exercise card */}
      {(phase === "exercise" || phase === "resting") && currentStep?.kind === "exercise" && (
        <div className="rounded-2xl border border-[var(--gold)]/30 bg-card p-8 text-center space-y-6">
          {phase === "exercise" ? (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Step {stepIndex + 1} of {totalExerciseSteps}
              </p>
              <h2 className="text-4xl font-bold text-[var(--gold)]">{currentStep.label}</h2>
              <p className="text-2xl font-semibold">{currentStep.reps}</p>
              {paused && (
                <p className="text-sm text-muted-foreground italic">Paused</p>
              )}
              <button
                onClick={handleExerciseDone}
                disabled={paused}
                className="mt-2 rounded-xl bg-[var(--gold)] px-8 py-3 text-[oklch(0.08_0.01_85)] font-bold text-base flex items-center gap-2 mx-auto hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <CheckCircle2 className="w-5 h-5" />
                Done — Start Rest
              </button>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Next: Step {stepIndex + 2} of {totalExerciseSteps}
              </p>
              <p className="text-sm font-medium text-muted-foreground">REST</p>
              <div
                className="text-7xl font-bold tabular-nums"
                style={{ color: countdown <= 3 ? "var(--gold)" : undefined }}
              >
                {formatTime(countdown)}
              </div>
              {paused && (
                <p className="text-sm text-muted-foreground italic">Paused</p>
              )}
              {!paused && steps[stepIndex + 1]?.kind === "exercise" && (
                <p className="text-sm text-muted-foreground">
                  Up next:{" "}
                  <span className="font-semibold text-foreground">
                    {(steps[stepIndex + 1] as Extract<WorkoutStep, { kind: "exercise" }>).label}
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Complete card */}
      {phase === "complete" && (
        <div className="rounded-2xl border border-[var(--emerald)]/40 bg-card p-8 text-center space-y-4">
          <CheckCircle2 className="w-14 h-14 text-[var(--emerald)] mx-auto" />
          <h2 className="text-3xl font-bold">Workout Complete!</h2>
          <p className="text-muted-foreground text-sm">
            {plan.summary} — all sets done.
          </p>
        </div>
      )}

      {/* Progress bar */}
      {phase !== "idle" && phase !== "complete" && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                background: "var(--gold)",
              }}
            />
          </div>
          <div className="flex gap-1 mt-1">
            {exerciseSteps.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full transition-all ${
                  i < completedSteps
                    ? "bg-[var(--gold)]"
                    : i === completedSteps
                    ? "bg-[var(--gold)]/30"
                    : "bg-white/5"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 justify-center">
        {/* Start / Pause button */}
        {phase !== "complete" && (
          <button
            onClick={handleStart}
            className="rounded-xl bg-[var(--gold)] px-8 py-3 text-[oklch(0.08_0.01_85)] font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            {showPauseIcon ? (
              <>
                <Pause className="w-5 h-5" /> Pause
              </>
            ) : phase === "idle" ? (
              <>
                <Play className="w-5 h-5" /> Start
              </>
            ) : (
              <>
                <Play className="w-5 h-5" /> Resume
              </>
            )}
          </button>
        )}

        {/* Reset */}
        {phase !== "idle" && (
          <button
            onClick={handleReset}
            className="rounded-xl border border-border px-6 py-3 text-sm font-medium flex items-center gap-2 text-muted-foreground hover:text-foreground hover:border-[var(--gold)]/30 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        )}

        {/* Restart after complete */}
        {phase === "complete" && (
          <button
            onClick={handleReset}
            className="rounded-xl bg-[var(--gold)] px-8 py-3 text-[oklch(0.08_0.01_85)] font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <RotateCcw className="w-5 h-5" />
            Do it again
          </button>
        )}
      </div>

      {/* Step list with done indicators — visible during workout */}
      {(phase === "exercise" || phase === "resting" || phase === "complete") && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Steps</h3>
          {exerciseSteps.map((step, i) => {
            const isDone = i < completedSteps;
            const isCurrent =
              i === stepIndex && phase === "exercise";
            const isRestingAfter =
              i === stepIndex && phase === "resting";

            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-2.5 rounded-xl text-sm transition-all ${
                  isCurrent
                    ? "bg-[var(--gold-muted)] border border-[var(--gold)]/30"
                    : isRestingAfter
                    ? "bg-white/3 border border-white/6"
                    : "border border-transparent"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-[var(--emerald)] shrink-0" />
                ) : isCurrent ? (
                  <ChevronRight className="w-4 h-4 text-[var(--gold)] shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-white/15 shrink-0" />
                )}
                <span className={isDone ? "text-muted-foreground line-through" : ""}>
                  {step.label}
                </span>
                <span className={`ml-auto text-xs ${isDone ? "text-muted-foreground" : "text-muted-foreground"}`}>
                  {step.reps}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
