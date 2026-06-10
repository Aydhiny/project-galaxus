import { create } from "zustand";

export interface PinnedVideo {
  id: string;
  title: string;
  channel: string;
}

interface FeedVideoState {
  pinned: PinnedVideo | null;
  collapsed: boolean;
  setPinned: (v: PinnedVideo | null) => void;
  setCollapsed: (v: boolean) => void;
}

export const useFeedVideoStore = create<FeedVideoState>()((set) => ({
  pinned: null,
  collapsed: false,
  setPinned: (v) => set({ pinned: v, collapsed: false }),
  setCollapsed: (v) => set({ collapsed: v }),
}));
