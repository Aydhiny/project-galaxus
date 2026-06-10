import { create } from "zustand";

interface CommandState {
  paletteOpen: boolean;
  captureOpen: boolean;
  openPalette:  () => void;
  closePalette: () => void;
  openCapture:  () => void;
  closeCapture: () => void;
}

export const useCommandStore = create<CommandState>()((set) => ({
  paletteOpen: false,
  captureOpen: false,
  openPalette:  () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openCapture:  () => set({ captureOpen: true }),
  closeCapture: () => set({ captureOpen: false }),
}));
