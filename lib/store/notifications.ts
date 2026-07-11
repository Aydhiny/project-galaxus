import { create } from "zustand";
import { getUnreadCount } from "@/lib/actions/notifications";

interface NotificationCountState {
  unread: number;
  fetched: boolean;
  setUnread: (n: number) => void;
  decrement: () => void;
  refresh: () => Promise<void>;
}

// Two <NotificationBell /> instances are mounted at once (desktop sidebar +
// mobile top bar — both render regardless of which is CSS-hidden at the
// current viewport), so this is shared rather than component-local state to
// avoid firing getUnreadCount() twice on every page load.
let inFlight: Promise<void> | null = null;

export const useNotificationCount = create<NotificationCountState>()((set) => ({
  unread: 0,
  fetched: false,
  setUnread: (n) => set({ unread: n, fetched: true }),
  decrement: () => set((s) => ({ unread: Math.max(0, s.unread - 1) })),
  refresh: () => {
    if (!inFlight) {
      inFlight = getUnreadCount()
        .then((n) => set({ unread: n, fetched: true }))
        .finally(() => { inFlight = null; });
    }
    return inFlight;
  },
}));
