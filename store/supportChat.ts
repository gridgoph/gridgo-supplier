import { create } from "zustand";

export const useSupportChatStore = create<{
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
}));
