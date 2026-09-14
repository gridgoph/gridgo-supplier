import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Notification } from "@/lib/api";
import * as alertsApi from "@/lib/alertsApi";
import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Which alerts the shop has dealt with, and the badge that follows.
 *
 * Every change here goes to GRIDGO first (`lib/alertsApi`). Two of the three
 * routes are new and may not be deployed yet, so when one answers "not there",
 * the decision is remembered on this device instead — which is what this app
 * did for everything before those routes existed.
 *
 * **The device-local half is temporary.** When mark-read and delete are live,
 * `dismissed` and `deleted` should be deleted outright along with the caveat
 * lines that describe them; `lib/alertsApi` names the rest of the cleanup. A
 * dismissal this phone remembers does not follow a shop to another phone, and
 * nothing in the app claims otherwise.
 */

type AlertsState = {
  ownerId: string | null;
  ownerBound: boolean;
  bindOwner: (id: string | null) => void;
  unreadCount: number;
  /** Alert ids this device has marked read because GRIDGO could not. */
  dismissed: string[];
  /** Alert ids this device has deleted because GRIDGO could not. */
  deleted: string[];
  hydrated: boolean;
  /**
   * Last stream event this phone has already seen. The live socket must resume
   * from here; opening with no cursor replays the whole inbox as if it were new.
   */
  streamCursor: string | null;
  rememberStreamCursor: (id: string | null) => void;
  /** True once any change had to fall back to this device. Drives the caveat. */
  localOnly: boolean;
  markRead: (id: string) => Promise<alertsApi.AlertWriteOutcome>;
  /** Mark exactly these read — never "everything", see `lib/alertsApi`. */
  markManyRead: (ids: string[]) => Promise<alertsApi.AlertWriteOutcome>;
  remove: (id: string) => Promise<alertsApi.AlertWriteOutcome>;
  /**
   * Delete exactly these. Same path as a single swipe-delete, one after another,
   * so a refusal mid-way keeps what already went and leaves the rest on screen.
   */
  removeMany: (ids: string[]) => Promise<alertsApi.AlertWriteOutcome>;
  /** Recount from a freshly loaded list, honouring local decisions. */
  syncFrom: (alerts: Notification[]) => void;
};

export function isAlertUnread(alert: Notification, dismissed: string[]): boolean {
  return !alert.read && !dismissed.includes(alert.id);
}

/** Alerts the shop still has: what GRIDGO served, minus anything deleted here. */
export function visibleAlerts(alerts: Notification[], deleted: string[]): Notification[] {
  return alerts.filter((alert) => !deleted.includes(alert.id));
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      ownerBound: false,
      bindOwner: (ownerId) => {
        if (get().ownerId !== ownerId) {
          set({ ownerId, ownerBound: true, unreadCount: 0, dismissed: [], deleted: [], streamCursor: null, localOnly: false });
        } else {
          set({ ownerBound: true });
        }
      },
      unreadCount: 0,
      dismissed: [],
      deleted: [],
      localOnly: false,
      hydrated: false,
      streamCursor: null,
      rememberStreamCursor: (id) => set({ streamCursor: id }),
      markRead: async (id) => {
        const outcome = await alertsApi.markRead(id);
        if (outcome.status === "failed") return outcome;

        const { dismissed, unreadCount } = get();
        if (!dismissed.includes(id)) {
          set({
            dismissed: [...dismissed, id],
            unreadCount: Math.max(0, unreadCount - 1),
          });
        }
        if (outcome.status === "not_open_yet") set({ localOnly: true });
        return outcome;
      },
      markManyRead: async (ids) => {
        const outcome = await alertsApi.markAllRead(ids);
        if (outcome.status === "failed") return outcome;

        const { dismissed } = get();
        const merged = [...new Set([...dismissed, ...ids])];
        set({
          dismissed: merged,
          unreadCount: Math.max(0, get().unreadCount - ids.filter((id) => !dismissed.includes(id)).length),
        });
        if (outcome.status === "not_open_yet") set({ localOnly: true });
        return outcome;
      },
      remove: async (id) => {
        const outcome = await alertsApi.remove(id);
        if (outcome.status === "failed") return outcome;

        const { deleted, dismissed, unreadCount } = get();
        set({
          deleted: deleted.includes(id) ? deleted : [...deleted, id],
          // A deleted alert cannot still be counted as unread.
          unreadCount: dismissed.includes(id) ? unreadCount : Math.max(0, unreadCount - 1),
        });
        if (outcome.status === "not_open_yet") set({ localOnly: true });
        return outcome;
      },
      removeMany: async (ids) => {
        let last: alertsApi.AlertWriteOutcome = { status: "saved" };
        for (const id of ids) {
          last = await get().remove(id);
          if (last.status === "failed") return last;
        }
        return last;
      },
      syncFrom: (alerts) => {
        const { dismissed, deleted } = get();
        // Drop ids the platform no longer serves so neither list can grow
        // without bound on a shop that has been running for months.
        const live = alerts.map((alert) => alert.id);
        const stillDismissed = dismissed.filter((id) => live.includes(id));
        const stillDeleted = deleted.filter((id) => live.includes(id));
        set({
          dismissed: stillDismissed,
          deleted: stillDeleted,
          unreadCount: visibleAlerts(alerts, stillDeleted).filter((alert) =>
            isAlertUnread(alert, stillDismissed),
          ).length,
        });
      },
    }),
    {
      name: "gridgo-supplier-alerts-v2",
      merge: (persisted, current) => {
        const saved = persisted as Partial<AlertsState> | undefined;
        if (!saved || (current.ownerBound && saved.ownerId !== current.ownerId)) return current;
        return {
          ...current,
          ownerId: saved.ownerId ?? null,
          dismissed: saved.dismissed ?? [],
          deleted: saved.deleted ?? [],
          localOnly: Boolean(saved.dismissed?.length || saved.deleted?.length),
        };
      },
      storage: createPersistStorage<
        Pick<AlertsState, "ownerId" | "dismissed" | "deleted">
      >(),
      partialize: (state) => ({
        dismissed: state.dismissed,
        deleted: state.deleted,
        ownerId: state.ownerId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
