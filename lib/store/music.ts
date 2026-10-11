import { create } from "zustand";

/** Your own focus track (YouTube), always first in the player. */
export const FOCUS_TRACK_ID = "mine";
export const FOCUS_VIDEO_ID = "6Kj-ye-aYBA";

// Shared so the top bar, focus mode and sleep guardian can start/stop the
// player that lives in the bottom bar (components/music-player.tsx).
interface MusicState {
  activeId: string | null;
  playerOpen: boolean;
  play: (id: string) => void;
  stop: () => void;
  setPlayerOpen: (open: boolean) => void;
}

export const useMusicStore = create<MusicState>()((set) => ({
  activeId: null,
  playerOpen: false,
  play: (id) => set({ activeId: id }),
  stop: () => set({ activeId: null, playerOpen: false }),
  setPlayerOpen: (open) => set({ playerOpen: open }),
}));
