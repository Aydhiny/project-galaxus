import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarCollapsed: boolean;
  sidebarHidden: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  toggleHidden: () => void;
  /** Sidebar nav groups the user has explicitly opened (all start closed). */
  openGroups: string[];
  toggleGroup: (label: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarHidden: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleHidden: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
      openGroups: [],
      toggleGroup: (label) =>
        set((s) => ({
          openGroups: s.openGroups.includes(label)
            ? s.openGroups.filter((g) => g !== label)
            : [...s.openGroups, label],
        })),
    }),
    { name: "galaxus-ui-v1" }
  )
);
