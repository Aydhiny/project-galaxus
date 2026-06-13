"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Wind, Circle, Play, Pause, RotateCcw, Sparkles } from "lucide-react";
import { upsertCheckin } from "@/lib/actions/checkin";
import { format } from "date-fns";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type BreathPhase = "inhale" | "hold-in" | "exhale" | "hold-out";
type SessionState = "idle" | "running" | "paused" | "complete";

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_DURATION = 4; // seconds per phase
const PHASES: BreathPhase[] = ["inhale", "hold-in", "exhale", "hold-out"];

const PHASE_LABELS: Record<BreathPhase, string> = {
  "inhale":   "Inhale",
  "hold-in":  "Hold",
  "exhale":   "Exhale",
  "hold-out": "Hold",
};

const SESSION_OPTIONS = [
  { label: "5 min",  seconds: 5 * 60 },
  { label: "10 min", seconds: 10 * 60 },
  { label: "20 min", seconds: 20 * 60 },
] as const;

// Scale targets: large during inhale & hold-in, small during exhale & hold-out
const PHASE_SCALE: Record<BreathPhase, number> = {
  "inhale":   1.0,
  "hold-in":  1.0,
  "exhale":   0.6,
  "hold-out": 0.6,
};

// ─── Web Audio helper ─────────────────────────────────────────────────────────

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & { __galaxusAudioCtx?: AudioContext };
  if (!win.__galaxusAudioCtx) {
    win.__galaxusAudioCtx = new AudioContext();
  }
  return win.__galaxusAudioCtx;
}

function playPhaseCue() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = 220;
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.6);
}

// ─── Format helper ────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MeditationPage() {
  const [selectedDuration, setSelectedDuration] = useState(SESSION_OPTIONS[0].seconds);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [timeRemaining, setTimeRemaining] = useState(SESSION_OPTIONS[0].seconds);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseCountdown, setPhaseCountdown] = useState(PHASE_DURATION);
  const [breathCycles, setBreathCycles] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<SessionState>("idle");
  stateRef.current = sessionState;

  const currentPhase = PHASES[phaseIndex];
  const circleScale = PHASE_SCALE[currentPhase];

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startSession = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume();

    setSessionState("running");
    setPhaseIndex(0);
    setPhaseCountdown(PHASE_DURATION);
    setTimeRemaining(selectedDuration);
    setBreathCycles(0);

    // Mutable counters inside the closure so we don't rely on stale state
    let phaseIdx = 0;
    let phaseTick = PHASE_DURATION;
    let totalRemaining = selectedDuration;

    playPhaseCue();

    intervalRef.current = setInterval(() => {
      if (stateRef.current === "paused") return;

      totalRemaining -= 1;
      phaseTick -= 1;

      if (totalRemaining <= 0) {
        clearTimer();
        setSessionState("complete");
        setTimeRemaining(0);
        setPhaseCountdown(0);
        return;
      }

      if (phaseTick <= 0) {
        // Advance phase
        const prevPhaseIdx = phaseIdx;
        phaseIdx = (phaseIdx + 1) % PHASES.length;
        phaseTick = PHASE_DURATION;
        playPhaseCue();
        setPhaseIndex(phaseIdx);

        // Count a completed breath cycle (full 4-phase loop = one cycle)
        if (prevPhaseIdx === PHASES.length - 1) {
          setBreathCycles((c) => c + 1);
        }
      }

      setPhaseCountdown(phaseTick);
      setTimeRemaining(totalRemaining);
    }, 1000);
  }, [clearTimer, selectedDuration]);

  const handleStartPause = useCallback(() => {
    if (sessionState === "idle" || sessionState === "complete") {
      startSession();
      return;
    }

    if (sessionState === "running") {
      setSessionState("paused");
    } else if (sessionState === "paused") {
      setSessionState("running");
    }
  }, [sessionState, startSession]);

  const handleReset = useCallback(() => {
    clearTimer();
    setSessionState("idle");
    setTimeRemaining(selectedDuration);
    setPhaseIndex(0);
    setPhaseCountdown(PHASE_DURATION);
    setBreathCycles(0);
  }, [clearTimer, selectedDuration]);

  // When duration picker changes while idle, reset the timer display too
  useEffect(() => {
    if (sessionState === "idle") {
      setTimeRemaining(selectedDuration);
    }
  }, [selectedDuration, sessionState]);

  // ── Sync meditation streak when session completes ────────────────────────────
  useEffect(() => {
    if (sessionState !== "complete") return;
    const today = format(new Date(), "yyyy-MM-dd");
    const minutes = Math.round(selectedDuration / 60);
    upsertCheckin(today, { meditation: true, meditationMinutes: minutes })
      .then(() => toast.success("Meditation streak updated! 🧘"))
      .catch(() => {/* silently ignore if DB not set up */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  const isActive = sessionState === "running" || sessionState === "paused";

  return (
    <div className="page max-w-xl">
      {/* Header */}
      <div>
        <p className="section-label mb-1">Meditation</p>
        <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Box Breathing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find a comfortable position. Close your eyes. Breathe.
        </p>
      </div>

      {/* Dua */}
      <div className="rounded-2xl border border-[var(--emerald)]/20 bg-card p-5 text-center space-y-1">
        <p className="text-xl font-semibold" dir="rtl" lang="ar">
          اللهم اجعل في قلبي نوراً
        </p>
        <p className="text-xs text-muted-foreground italic">
          O Allah, place light in my heart
        </p>
      </div>

      {/* Duration selector — only when idle */}
      {sessionState === "idle" && (
        <div className="glass p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Session Duration
          </p>
          <div className="flex gap-3">
            {SESSION_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                onClick={() => setSelectedDuration(opt.seconds)}
                className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-all border ${
                  selectedDuration === opt.seconds
                    ? "bg-[var(--emerald)] border-[var(--emerald)] text-[oklch(0.08_0.01_85)]"
                    : "border-border bg-transparent hover:border-[var(--emerald)]/30 text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Breathing circle */}
      <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-6">
        {/* SVG circle — scales on phase change */}
        <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
          {/* Outer glow ring */}
          <div
            className="absolute inset-0 rounded-full transition-all duration-[4000ms] ease-in-out"
            style={{
              transform: `scale(${circleScale})`,
              background: "radial-gradient(circle, oklch(0.70 0.15 155 / 12%) 0%, transparent 70%)",
            }}
          />

          {/* Main SVG circle */}
          <svg
            width="220"
            height="220"
            viewBox="0 0 220 220"
            className="absolute inset-0"
            style={{
              transform: `scale(${circleScale})`,
              transition: "transform 4s ease-in-out",
            }}
          >
            {/* Outer ring */}
            <circle
              cx="110"
              cy="110"
              r="100"
              fill="none"
              stroke="oklch(0.70 0.15 155 / 25%)"
              strokeWidth="1.5"
            />
            {/* Middle fill */}
            <circle
              cx="110"
              cy="110"
              r="90"
              fill="oklch(0.70 0.15 155 / 8%)"
              stroke="oklch(0.70 0.15 155 / 40%)"
              strokeWidth="1"
            />
            {/* Inner core */}
            <circle
              cx="110"
              cy="110"
              r="60"
              fill="oklch(0.70 0.15 155 / 15%)"
            />
          </svg>

          {/* Centre content */}
          <div className="relative z-10 text-center select-none">
            {sessionState === "idle" ? (
              <Circle className="w-8 h-8 text-[var(--emerald)] mx-auto opacity-50" />
            ) : sessionState === "complete" ? (
              <Sparkles className="w-8 h-8 text-[var(--emerald)] mx-auto" />
            ) : (
              <>
                <p className="text-[var(--emerald)] font-semibold text-base leading-tight">
                  {PHASE_LABELS[currentPhase]}
                </p>
                <p
                  className="text-5xl font-bold tabular-nums leading-none mt-1"
                  style={{ color: "var(--emerald)" }}
                >
                  {phaseCountdown}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Phase indicator dots */}
        {isActive && (
          <div className="flex items-center gap-3">
            {PHASES.map((phase, i) => (
              <div key={phase} className="flex flex-col items-center gap-1">
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === phaseIndex
                      ? "bg-[var(--emerald)] scale-125"
                      : i < phaseIndex
                      ? "bg-[var(--emerald)]/40"
                      : "bg-foreground/[0.12]"
                  }`}
                />
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  {PHASE_LABELS[phase]}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Phase label for idle */}
        {sessionState === "idle" && (
          <p className="text-sm text-muted-foreground text-center">
            4s inhale · 4s hold · 4s exhale · 4s hold
          </p>
        )}

        {/* Complete message */}
        {sessionState === "complete" && (
          <div className="text-center space-y-1">
            <p className="font-semibold text-[var(--emerald)]">Session Complete</p>
            <p className="text-sm text-muted-foreground">
              {breathCycles} breath {breathCycles === 1 ? "cycle" : "cycles"} completed
            </p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold text-[var(--emerald)]">
            {formatTime(timeRemaining)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Remaining</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold">{breathCycles}</p>
          <p className="text-xs text-muted-foreground mt-1">Cycles</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold">
            {PHASE_DURATION}s
          </p>
          <p className="text-xs text-muted-foreground mt-1">Per phase</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 justify-center">
        <button
          onClick={handleStartPause}
          className="rounded-xl px-8 py-3 font-bold text-base flex items-center gap-2 transition-opacity hover:opacity-90"
          style={{
            background: "var(--emerald)",
            color: "oklch(0.08 0.01 85)",
          }}
        >
          {sessionState === "running" ? (
            <>
              <Pause className="w-5 h-5" /> Pause
            </>
          ) : sessionState === "paused" ? (
            <>
              <Play className="w-5 h-5" /> Resume
            </>
          ) : sessionState === "complete" ? (
            <>
              <RotateCcw className="w-5 h-5" /> Again
            </>
          ) : (
            <>
              <Play className="w-5 h-5" /> Begin
            </>
          )}
        </button>

        {sessionState !== "idle" && (
          <button
            onClick={handleReset}
            className="rounded-xl border border-border px-6 py-3 text-sm font-medium flex items-center gap-2 text-muted-foreground hover:text-foreground hover:border-[var(--emerald)]/30 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        )}
      </div>

      {/* Paused notice */}
      {sessionState === "paused" && (
        <p className="text-center text-sm text-muted-foreground italic">
          Session paused — take your time.
        </p>
      )}
    </div>
  );
}
