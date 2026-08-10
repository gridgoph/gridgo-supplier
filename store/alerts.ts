import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Notification } from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Which alerts the shop has already dealt with, and the badge that follows.
 *
 * GRIDGO has no route for marking a notification read — `GET /notifications` is
 * the whole surface, and the `read` flag on a record is only ever set by the
 * platform itself. So dismissing one is a decision this device remembers, kept
 * on the phone so it survives a restart rather than the list refilling with
 * things the shop has already seen.
 *
 * The consequence is worth being clear about: reading an alert here does not
 * read it on another device. Nothing in the app claims otherwise, and when the
 * platform grows a route this store is the one place that has to change.
 */

type AlertsState = {
  unreadCount: number;
  /** Alert ids this device has dismissed. */
  dismissed: string[];
  hydrated: boolean;
  markRead: (id: string) => void;
  /** Recount from a freshly loaded list, honouring local dismissals. */
  syncFrom: (alerts: Notification[]) => void;
};

export function isAlertUnread(alert: Notification, dismissed: string[]): boolean {
  return !alert.read && !dismissed.includes(alert.id);
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      unreadCount: 0,
      dismissed: [],
      hydrated: false,
      markRead: (id) => {
        const { dismissed, unreadCount } = get();
        if (dismissed.includes(id)) return;
        set({
          dismissed: [...dismissed, id],
          unreadCount: Math.max(0, unreadCount - 1),
        });
      },
      syncFrom: (alerts) => {
        const { dismissed } = get();
        // Drop ids the platform no longer serves so the list cannot grow without
        // bound on a shop that has been running for months.
        const live = alerts.map((alert) => alert.id);
        const stillThere = dismissed.filter((id) => live.includes(id));
        set({
          dismissed: stillThere,
          unreadCount: alerts.filter((alert) => isAlertUnread(alert, stillThere)).length,
        });
      },
    }),
    {
      name: "gridgo-supplier-alerts",
      storage: createPersistStorage<Pick<AlertsState, "dismissed">>(),
      partialize: (state) => ({ dismissed: state.dismissed }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
