import { create } from "zustand";

interface AmbientState {
  rainVol: number;
  fireVol: number;
  brownVol: number;
  setRainVol: (v: number) => void;
  setFireVol: (v: number) => void;
  setBrownVol: (v: number) => void;
}

export const useAmbientStore = create<AmbientState>()((set) => ({
  rainVol: 0,
  fireVol: 0,
  brownVol: 0,
  setRainVol: (v) => set({ rainVol: v }),
  setFireVol: (v) => set({ fireVol: v }),
  setBrownVol: (v) => set({ brownVol: v }),
}));
