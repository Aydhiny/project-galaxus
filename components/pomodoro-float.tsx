"use client";

import { useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, SkipForward, Minus, X, Coffee, Brain } from "lucide-react";
import { usePomodoroStore, type PomodoroMode } from "@/lib/store/pomodoro";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<PomodoroMode, string> = {
  idle:      "Focus",
  work:      "Focus",
  break:     "Short Break",
  longBreak: "Long Break",
};

const MODE_COLOR: Record<PomodoroMode, string> = {
  idle:      "var(--gold)",
  work:      "var(--gold)",
  break:     "var(--emerald)",
  longBreak: "oklch(0.68 0.18 220)",
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatTime(s: number) {
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function FloatingPomodoro() {
  const {
    mode, secondsLeft, isRunning, sessionsCompleted, minimized,
    workMins, breakMins,
    start, pause, reset, skip, tick, setMinimized,
  } = usePomodoroStore();

  // Tick interval
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isRunning) {
      tickRef.current = setInterval(tick, 1000);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isRunning, tick]);

  // Alt+P global hotkey
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "p") {
        e.preventDefault();
        if (mode === "idle" || mode === "work" || mode === "break" || mode === "longBreak") {
          isRunning ? pause() : start();
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isRunning, mode, start, pause]);

  const color = MODE_COLOR[mode];
  const total = mode === "work" || mode === "idle" ? workMins * 60
    : mode === "break" ? breakMins * 60 : 15 * 60;
  const progress = total > 0 ? (total - secondsLeft) / total : 0;
  const circumference = 2 * Math.PI * 26; // r=26

  // Only show when active (not idle + not running) or minimized
  const isActive = mode !== "idle" || isRunning || sessionsCompleted > 0;

  if (!isActive && !minimized) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Open Pomodoro timer (Alt+P)"
        className={cn(
          "fixed bottom-20 left-4 z-[90] flex items-center gap-2 px-3 py-2 rounded-xl",
          "bg-card border border-border shadow-lg text-xs font-semibold tabular-nums transition-all hover:scale-105"
        )}
        style={{ color }}
      >
        {mode === "break" || mode === "longBreak"
          ? <Coffee className="w-3.5 h-3.5" />
          : <Brain className="w-3.5 h-3.5" />}
        {formatTime(secondsLeft)}
        {isRunning && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
      </button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-20 left-4 z-[90] w-48 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl",
      "transition-all duration-200"
    )}
      style={{ boxShadow: `0 8px 32px oklch(0 0 0 / 40%), 0 0 0 1px oklch(1 0 0 / 6%)` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>
          {MODE_LABEL[mode]}
        </span>
        <div className="flex gap-1">
          <button onClick={() => setMinimized(true)}
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Minus className="w-3 h-3" />
          </button>
          <button onClick={reset}
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Circular progress + time */}
      <div className="flex flex-col items-center py-3 gap-2">
        <div className="relative w-16 h-16">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
            {/* Track */}
            <circle cx="30" cy="30" r="26" fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="3" />
            {/* Progress */}
            <circle cx="30" cy="30" r="26" fill="none"
              stroke={color} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold tabular-nums" style={{ color }}>
              {formatTime(secondsLeft)}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button onClick={reset}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={isRunning ? pause : start}
            className="w-9 h-9 rounded-xl flex items-center justify-center font-semibold transition-all hover:scale-105"
            style={{ background: color, color: "oklch(0.08 0.01 85)" }}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button onClick={skip}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sessions count */}
      <div className="flex items-center justify-center gap-1 pb-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full transition-all"
            style={{ background: i < (sessionsCompleted % 4) ? color : "oklch(1 0 0 / 15%)" }} />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1">{sessionsCompleted} done</span>
      </div>

      {/* Alt+P hint */}
      <div className="px-3 pb-2 text-center">
        <span className="text-[9px] text-muted-foreground/50">Alt+P to play/pause</span>
      </div>
    </div>
  );
}
