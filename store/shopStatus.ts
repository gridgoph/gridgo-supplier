import { create } from "zustand";

import * as api from "@/lib/api";
import { humanizeApiError, isRouteNotOpen, isShopStatusStale, offlineMessage } from "@/lib/apiErrors";
import { changeSentence, normalizeShopStatus, type ShopStatusPatch, type ShopStatusRecord } from "@/lib/shopStatus";
import { useShopHours } from "@/store/shopHours";

/**
 * The shop's status (`/me/shop-status`): open or closed, Express, night jobs,
 * printer pings and a pause.
 *
 * A store because three places read the same answer — My shop's sign and
 * chips, the To do status pill and the status sheet — and a change made in the
 * sheet has to be on the sign behind it the moment the sheet closes. Never
 * persisted: this is GRIDGO's answer, not the phone's.
 *
 * Every write carries the version it was made against. When GRIDGO says the
 * shop moved on (another phone, the hours screen, the web dashboard), the
 * latest is read again and the shop is told to make the change once more,
 * rather than the phone overwriting a change it never saw.
 */
export type StatusSaveOutcome = { ok: true; message: string } | { ok: false; message: string };

type ShopStatusState = {
  status: ShopStatusRecord | null;
  phase: "idle" | "loading" | "ready" | "not_open_yet" | "failed";
  error: string | null;
  saving: boolean;
  load: () => Promise<void>;
  save: (patch: ShopStatusPatch) => Promise<StatusSaveOutcome>;
  reset: () => void;
};

/** Bumped by `reset`; an answer for the previous account is discarded. */
let generation = 0;
/** Numbers each read; an answer older than one already applied is dropped. */
let readsStarted = 0;
let readApplied = 0;
/** Bumped by every accepted write; a read that started before it is stale. */
let writesAccepted = 0;

/**
 * Whether a read's answer may replace what the store holds.
 *
 * A read can be overtaken twice over: by a later read that answered first, or
 * by a change the shop made while it was in flight. Either way it describes
 * the shop as it was, and applying it would flip a switch back under the
 * success sentence that said it moved. GRIDGO's version is the last word: an
 * answer older than the one held never wins.
 */
function readIsCurrent(ticket: number, writesAtStart: number, version: number, held: ShopStatusRecord | null): boolean {
  if (ticket < readApplied) return false;
  if (writesAtStart !== writesAccepted) return false;
  return held == null || version >= held.version;
}

export const STALE_STATUS_MESSAGE =
  "Your shop changed on another screen or phone. The latest is loaded — check it and make your change again.";

export const useShopStatus = create<ShopStatusState>((set, get) => ({
  status: null,
  phase: "idle",
  error: null,
  saving: false,

  load: async () => {
    const started = generation;
    const ticket = (readsStarted += 1);
    const writesAtStart = writesAccepted;
    if (!get().status) set({ phase: "loading" });
    try {
      const status = normalizeShopStatus(await api.getShopStatus());
      if (started !== generation) return;
      if (!status) throw new Error("unreadable shop status");
      if (!readIsCurrent(ticket, writesAtStart, status.version, get().status)) return;
      readApplied = ticket;
      set({ status, phase: "ready", error: null });
    } catch (error) {
      if (started !== generation || ticket < readApplied) return;
      if (isRouteNotOpen(error)) {
        set({ status: null, phase: "not_open_yet", error: null });
        return;
      }
      set({
        phase: get().status ? "ready" : "failed",
        error: humanizeApiError(error, offlineMessage("load your shop status")),
      });
    }
  },

  save: async (patch) => {
    const current = get().status;
    if (!current) return { ok: false, message: "Your shop status is still loading." };
    if (get().saving) return { ok: false, message: "Still saving your last change." };
    const started = generation;
    set({ saving: true });
    try {
      const status = normalizeShopStatus(await api.updateShopStatus(current.version, patch));
      if (started !== generation) return { ok: false, message: "" };
      writesAccepted += 1;
      if (status) set({ status, phase: "ready", error: null });
      else void get().load();
      // Hours and status share one version, and the hours screen shows the
      // manual closure too: read it again so neither holds a stale copy.
      void useShopHours.getState().load();
      return { ok: true, message: changeSentence(patch) };
    } catch (error) {
      if (isShopStatusStale(error)) {
        void get().load();
        return { ok: false, message: STALE_STATUS_MESSAGE };
      }
      return { ok: false, message: humanizeApiError(error, offlineMessage("save your shop status")) };
    } finally {
      if (started === generation) set({ saving: false });
    }
  },

  reset: () => {
    generation += 1;
    set({ status: null, phase: "idle", error: null, saving: false });
  },
}));
