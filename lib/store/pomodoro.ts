import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PomodoroMode = "idle" | "work" | "break" | "longBreak";

/** Save focus time to your account (focus sessions → Discipline XP, HUD, Weekly Review). */
function logFocus(minutes: number, completed: boolean) {
  if (typeof window === "undefined" || minutes < 1) return;
  void import("@/lib/client/wellbeing").then((m) => m.logFocusC(minutes, "Pomodoro", completed)).catch(() => {});
}
/** Notification exists on desktop browsers but not on iOS Safari tabs — guard before touching it. */
function notify(title: string, body: string) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  }
}

interface PomodoroState {
  mode: PomodoroMode;
  secondsLeft: number;
  isRunning: boolean;
  sessionsCompleted: number;
  minimized: boolean;

  // Settings (persisted)
  workMins: number;
  breakMins: number;
  longBreakMins: number;
  longBreakAfter: number; // sessions before long break

  // Actions
  start:        () => void;
  pause:        () => void;
  reset:        () => void;
  skip:         () => void;
  tick:         () => void; // called every second by the component
  setMinimized: (v: boolean) => void;
  setWorkMins:  (v: number)  => void;
  setBreakMins: (v: number)  => void;
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      mode:               "idle",
      secondsLeft:        25 * 60,
      isRunning:          false,
      sessionsCompleted:  0,
      minimized:          false,
      workMins:           25,
      breakMins:          5,
      longBreakMins:      15,
      longBreakAfter:     4,

      start: () => set({ isRunning: true }),
      pause: () => set({ isRunning: false }),

      reset: () => {
        const { workMins } = get();
        set({ mode: "idle", secondsLeft: workMins * 60, isRunning: false });
      },

      skip: () => {
        const { mode, sessionsCompleted, workMins, breakMins, longBreakMins, longBreakAfter, secondsLeft } = get();
        // Skipping mid-session still counts the minutes you actually focused (5+).
        if (mode === "work") { const done = Math.floor((workMins * 60 - secondsLeft) / 60); if (done >= 5) logFocus(done, false); }
        if (mode === "work" || mode === "idle") {
          const completed = sessionsCompleted + (mode === "work" ? 1 : 0);
          const isLong = completed > 0 && completed % longBreakAfter === 0;
          set({
            mode: isLong ? "longBreak" : "break",
            secondsLeft: isLong ? longBreakMins * 60 : breakMins * 60,
            isRunning: false,
            sessionsCompleted: completed,
          });
        } else {
          set({ mode: "idle", secondsLeft: workMins * 60, isRunning: false });
        }
      },

      tick: () => {
        const { secondsLeft, mode, sessionsCompleted, workMins, breakMins, longBreakMins, longBreakAfter } = get();
        if (secondsLeft > 1) {
          set({ secondsLeft: secondsLeft - 1 });
          return;
        }
        // Timer expired
        if (mode === "work") {
          const completed = sessionsCompleted + 1;
          const isLong = completed % longBreakAfter === 0;
          logFocus(workMins, true);
          notify("Pomodoro complete!", isLong ? "Time for a long break. Well done." : "Short break — 5 minutes.");
          set({
            mode: isLong ? "longBreak" : "break",
            secondsLeft: isLong ? longBreakMins * 60 : breakMins * 60,
            sessionsCompleted: completed,
            isRunning: false, // auto-pause; user manually starts break
          });
        } else {
          // break → work
          notify("Break over", "Time to focus.");
          set({ mode: "work", secondsLeft: workMins * 60, isRunning: false });
        }
      },

      setMinimized: (v) => set({ minimized: v }),
      setWorkMins:  (v) => set({ workMins: v, secondsLeft: v * 60, mode: "idle", isRunning: false }),
      setBreakMins: (v) => set({ breakMins: v }),
    }),
    { name: "galaxus-pomodoro-v1", partialize: (s) => ({ workMins: s.workMins, breakMins: s.breakMins, longBreakMins: s.longBreakMins, sessionsCompleted: s.sessionsCompleted }) }
  )
);
