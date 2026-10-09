import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RoomTheme = "minimal" | "cabin" | "bamboo" | "lofi" | "nook" | "mountain";

export interface RoomInfo {
  label: string;
  emoji: string;
  desc: string;
  accent: string; // CSS color string for preview swatch
}

export const ROOM_THEMES: Record<RoomTheme, RoomInfo> = {
  minimal:  { label: "Minimal",      emoji: "◻️", desc: "Clean and calm, no decorations",       accent: "#8b8b90" },
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
      theme: "minimal",
      decorations: {
        candles: true,
        window: true,
        plants: true,
        artwork: true,
        grain: false,
      },
      setTheme: (theme) => set({ theme }),
      toggleDecoration: (key) =>
        set((s) => ({ decorations: { ...s.decorations, [key]: !s.decorations[key] } })),
    }),
    {
      name: "galaxus-room-v1",
      // v2 = sleek redesign: move everyone onto the new Minimal default once.
      // Rooms are still one click away in the sidebar's Room Theme picker.
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<RoomState>;
        if (version < 2) return { ...state, theme: "minimal", decorations: { ...state.decorations!, grain: false } } as RoomState;
        return state as RoomState;
      },
    }
  )
);
