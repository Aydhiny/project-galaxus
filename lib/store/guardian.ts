import { create } from "zustand";

export type FocusRun = { minutes: number; label: string; startedAt: number };

// Opened from the top bar, the /hold page or a keyboard shortcut; rendered by components/guardian.tsx.
interface GuardianState {
  emergency: boolean;
  focusPrompt: boolean;
  focus: FocusRun | null;
  openEmergency: () => void;
  closeEmergency: () => void;
  openFocusPrompt: () => void;
  closeFocusPrompt: () => void;
  startFocus: (run: FocusRun) => void;
  endFocus: () => void;
}

export const useGuardianStore = create<GuardianState>()((set) => ({
  emergency: false,
  focusPrompt: false,
  focus: null,
  openEmergency: () => set({ emergency: true }),
  closeEmergency: () => set({ emergency: false }),
  openFocusPrompt: () => set({ focusPrompt: true }),
  closeFocusPrompt: () => set({ focusPrompt: false }),
  startFocus: (run) => set({ focus: run, focusPrompt: false }),
  endFocus: () => set({ focus: null }),
}));

export const SLEEP_SETTINGS_EVENT = "galaxus:sleep-settings";
