import { create } from "zustand";

type AlertsState = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
};

/** Unread alert count for the Alerts tab badge. Updated when notifications load. */
export const useAlertsStore = create<AlertsState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
}));
