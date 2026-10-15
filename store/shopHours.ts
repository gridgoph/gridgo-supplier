import { create } from "zustand";

import * as api from "@/lib/api";
import { humanizeApiError, isRouteNotOpen, isSupplierProfileStale, offlineMessage } from "@/lib/apiErrors";
import { normalizeShopHours, type ShopHours, type ShopHoursPatch } from "@/lib/shopHours";

/**
 * The shop's hours as GRIDGO holds them (`/me/shop-hours`).
 *
 * A store because three screens read the same answer — Shop hours edits it,
 * Schedule marks closed days with it, and accepting a job warns about a
 * closure on its due date — and a save on one should be on the others when the
 * shop goes back. Never persisted: these are GRIDGO's hours, not the phone's.
 */
export type SaveOutcome = { ok: true } | { ok: false; message: string };

type ShopHoursState = {
  hours: ShopHours | null;
  status: "idle" | "loading" | "ready" | "not_open_yet" | "failed";
  error: string | null;
  saving: boolean;
  load: () => Promise<void>;
  save: (patch: ShopHoursPatch) => Promise<SaveOutcome>;
  reset: () => void;
};

/** Bumped by `reset`; an answer for the previous account is discarded. */
let generation = 0;

export const STALE_HOURS_MESSAGE =
  "Your shop's details changed somewhere else while this screen was open. The latest hours are loaded — check them and make your change again.";

export const useShopHours = create<ShopHoursState>((set, get) => ({
  hours: null,
  status: "idle",
  error: null,
  saving: false,

  load: async () => {
    const started = generation;
    if (!get().hours) set({ status: "loading" });
    try {
      const hours = normalizeShopHours(await api.getShopHours());
      if (started !== generation) return;
      if (!hours) throw new Error("unreadable shop hours");
      set({ hours, status: "ready", error: null });
    } catch (error) {
      if (started !== generation) return;
      if (isRouteNotOpen(error)) {
        set({ hours: null, status: "not_open_yet", error: null });
        return;
      }
      set({
        status: get().hours ? "ready" : "failed",
        error: humanizeApiError(error, offlineMessage("load your shop hours")),
      });
    }
  },

  save: async (patch) => {
    const current = get().hours;
    if (!current || get().saving) return { ok: false, message: "Your shop hours are still loading." };
    const started = generation;
    set({ saving: true });
    try {
      const hours = normalizeShopHours(await api.updateShopHours(current.version, patch));
      if (started !== generation) return { ok: false, message: "" };
      if (hours) set({ hours, status: "ready", error: null });
      else void get().load();
      return { ok: true };
    } catch (error) {
      if (isSupplierProfileStale(error)) {
        void get().load();
        return { ok: false, message: STALE_HOURS_MESSAGE };
      }
      return { ok: false, message: humanizeApiError(error, offlineMessage("save your shop hours")) };
    } finally {
      if (started === generation) set({ saving: false });
    }
  },

  reset: () => {
    generation += 1;
    set({ hours: null, status: "idle", error: null, saving: false });
  },
}));
