import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PomodoroMode = "idle" | "work" | "break" | "longBreak";

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
        const { mode, sessionsCompleted, workMins, breakMins, longBreakMins, longBreakAfter } = get();
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
          // Browser notification
          if (typeof window !== "undefined" && Notification.permission === "granted") {
            new Notification("Pomodoro complete!", {
              body: isLong ? "Time for a long break. Well done." : "Short break — 5 minutes.",
              icon: "/icons/icon-192.png",
            });
          }
          set({
            mode: isLong ? "longBreak" : "break",
            secondsLeft: isLong ? longBreakMins * 60 : breakMins * 60,
            sessionsCompleted: completed,
            isRunning: false, // auto-pause; user manually starts break
          });
        } else {
          // break → work
          if (typeof window !== "undefined" && Notification.permission === "granted") {
            new Notification("Break over", { body: "Time to focus.", icon: "/icons/icon-192.png" });
          }
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
