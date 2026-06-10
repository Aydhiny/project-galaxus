"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Mode = "focus" | "short" | "long";

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

const MODE_LABELS: Record<Mode, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
};

const MODE_COLORS: Record<Mode, string> = {
  focus: "var(--gold)",
  short: "var(--emerald)",
  long: "#60a5fa",
};

const SESSIONS_BEFORE_LONG = 4;

// ─── Web Audio helpers ────────────────────────────────────────────────────────

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, freq: number, startAt: number, duration = 0.4, gain = 0.18) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function playCompletionBell() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 440, t, 0.5, 0.2);
  playTone(ctx, 550, t + 0.55, 0.5, 0.2);
  playTone(ctx, 660, t + 1.1, 0.6, 0.2);
}

function playTick(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = 600;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

// ─── SVG ring ────────────────────────────────────────────────────────────────

function ProgressRing({
  progress,
  color,
  size = 200,
  strokeWidth = 8,
}: {
  progress: number; // 0–1
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  const cx = size / 2;

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90" style={{ transform: "rotate(-90deg)" }}>
      {/* Track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.4s ease" }}
      />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PomodoroTimer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [timeLeft, setTimeLeft] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState(1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickMinuteRef = useRef<number>(-1);

  function getOrCreateCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = getAudioCtx();
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  const handleComplete = useCallback(() => {
    setRunning(false);
    playCompletionBell();

    if (mode === "focus") {
      const newSession = session + 1;
      setSession(newSession);

      if ((session) % SESSIONS_BEFORE_LONG === 0) {
        toast.success("4 sessions done — time for a long break! 🎉");
        switchMode("long");
      } else {
        toast.success(`Focus session ${session} complete! Take a short break.`);
        switchMode("short");
      }
    } else {
      toast("Break over — back to focus!");
      switchMode("focus");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session]);

  useEffect(() => {
    if (!running) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          handleComplete();
          return 0;
        }

        // Gentle tick every minute
        const ctx = audioCtxRef.current;
        const minutesPassed = Math.floor((DURATIONS[mode] - prev + 1) / 60);
        if (minutesPassed > 0 && minutesPassed !== lastTickMinuteRef.current) {
          lastTickMinuteRef.current = minutesPassed;
          if (ctx) playTick(ctx);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, handleComplete, mode]);

  function switchMode(m: Mode) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setMode(m);
    setTimeLeft(DURATIONS[m]);
    setRunning(false);
    lastTickMinuteRef.current = -1;
  }

  function toggle() {
    getOrCreateCtx();
    setRunning((r) => !r);
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeLeft(DURATIONS[mode]);
    setRunning(false);
    lastTickMinuteRef.current = -1;
  }

  const total = DURATIONS[mode];
  const progress = (total - timeLeft) / total;
  const color = MODE_COLORS[mode];

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");

  const sessionDisplay = `Session ${session} of ${SESSIONS_BEFORE_LONG}`;

  return (
    <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-6 space-y-6">
      {/* Section label */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Productivity</p>
        <h2 className="text-sm font-semibold mt-0.5">Pomodoro Timer</h2>
      </div>

      <div className="flex flex-col items-center gap-6">
        {/* Mode tabs */}
        <div className="flex gap-2">
          {(["focus", "short", "long"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn(
                "px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200",
                mode === m
                  ? "border"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={
                mode === m
                  ? {
                      backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
                      borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
                      color,
                    }
                  : {}
              }
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Timer ring */}
        <div className="relative w-[200px] h-[200px] flex items-center justify-center">
          <ProgressRing progress={progress} color={color} size={200} strokeWidth={8} />
          <div className="text-center space-y-1 z-10">
            <p
              className="text-6xl font-bold tabular-nums tracking-tight leading-none"
              style={{ color }}
            >
              {mins}:{secs}
            </p>
            <p className="text-xs text-muted-foreground">{MODE_LABELS[mode]}</p>
          </div>
        </div>

        {/* Session counter */}
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{sessionDisplay}</p>
          <div className="flex gap-1">
            {Array.from({ length: SESSIONS_BEFORE_LONG }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i < (session - 1) % SESSIONS_BEFORE_LONG
                    ? "opacity-100"
                    : "bg-white/15"
                )}
                style={
                  i < (session - 1) % SESSIONS_BEFORE_LONG
                    ? { backgroundColor: color }
                    : {}
                }
              />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all duration-200"
          >
            Reset
          </button>
          <button
            onClick={toggle}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95"
            style={{
              backgroundColor: color,
              color: "oklch(0.08 0.01 85)",
            }}
          >
            {running ? "Pause" : timeLeft === total ? "Start" : "Resume"}
          </button>
        </div>
      </div>
    </div>
  );
}
