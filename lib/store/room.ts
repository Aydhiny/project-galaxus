import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RoomTheme = "cabin" | "bamboo" | "lofi" | "nook" | "mountain";

export interface RoomInfo {
  label: string;
  emoji: string;
  desc: string;
  accent: string; // CSS color string for preview swatch
}

export const ROOM_THEMES: Record<RoomTheme, RoomInfo> = {
  cabin:    { label: "Cozy Cabin",   emoji: "🪵", desc: "Dark oak, firelight, stone hearth",   accent: "#C9852A" },
  bamboo:   { label: "Bamboo Zen",   emoji: "🎋", desc: "Forest deep, jade calm, bamboo light", accent: "#5DBD8C" },
  lofi:     { label: "Lofi Night",   emoji: "🌙", desc: "Indigo dusk, city rain, cassette glow", accent: "#9B7FE8" },
  nook:     { label: "Reading Nook", emoji: "📚", desc: "Amber lamp, leather chair, books stacked", accent: "#D4A44C" },
  mountain: { label: "Mountain Hut", emoji: "🏔️", desc: "Slate frost, pine smoke, snowfall",      accent: "#6DA8CC" },
};

export interface Decorations {
  candles: boolean;
  window: boolean;
  plants: boolean;
  artwork: boolean;
  grain: boolean;
}

interface RoomState {
  theme: RoomTheme;
  decorations: Decorations;
  setTheme: (t: RoomTheme) => void;
  toggleDecoration: (key: keyof Decorations) => void;
}

export const useRoomStore = create<RoomState>()(
  persist(
    (set) => ({
      theme: "cabin",
      decorations: {
        candles: true,
        window: true,
        plants: true,
        artwork: true,
        grain: true,
      },
      setTheme: (theme) => set({ theme }),
      toggleDecoration: (key) =>
        set((s) => ({ decorations: { ...s.decorations, [key]: !s.decorations[key] } })),
    }),
    { name: "galaxus-room-v1" }
  )
);
