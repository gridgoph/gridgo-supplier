import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { apiErrorCode, humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { createPersistStorage } from "@/lib/persistStorage";
import { setSharedDevice } from "@/lib/sharedDevice";
import type { ShopRole } from "@/lib/shopTeam";
import { useAlertsStore } from "@/store/alerts";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";
import { useToasts } from "@/store/toasts";

/**
 * The shop's phone, shared by phone-free teammates (gridgo-api
 * `docs/SHOP_TEAM_API.md`, "Phone-free Staff and shared devices").
 *
 * The rules this store exists to keep, all of them GRIDGO's:
 *
 * - **Before the phone is shared,** the signed-in person's own things leave it:
 *   their push registration, their live alert stream and their cached alerts.
 *   GRIDGO refuses personal notification routes inside a shared session.
 * - **A pick lasts 30 minutes,** bound to this login on this phone. The token
 *   is held in memory by `lib/api.ts` and nowhere else.
 * - **Lock, expiry, a new PIN and removal all end at the picker,** never at the
 *   Owner. Getting the Owner's screens back takes a fresh sign-in (or the
 *   Owner's own phone), so Sign out is the picker's only other door.
 *
 * `shared` and the shop's name are kept across restarts so a phone that was
 * shared reopens on the picker without a flash of the Owner's screens. GRIDGO
 * is the authority either way: a locked session answers every shop request
 * with a worker error, which brings the picker back (`api.setWorkerLostHandler`).
 */

export type ActiveWorker = { pinStaffId: string; name: string; role: ShopRole };

/** How long the app may sit in the background before the phone locks itself. */
export const BACKGROUND_LOCK_MS = 2 * 60_000;

/** Why the picker is showing, said once above the faces. */
export type PickerNotice = "timed_out" | "locked_elsewhere" | null;

type ShopWorkerState = {
  shared: boolean;
  shopName: string | null;
  worker: ActiveWorker | null;
  notice: PickerNotice;
  /** Start sharing this phone: the signed-in person's own alerts and push leave it first. */
  enter: (shopName: string | null) => Promise<void>;
  /** Pick a person with their PIN. Returns the sentence to show, or null when they are in. */
  select: (pinStaffId: string, pin: string) => Promise<string | null>;
  /** Hand the phone to the next person. */
  lock: () => Promise<void>;
  /** GRIDGO ended the turn (time, lock, new PIN, removal): back to the picker. */
  lost: (code: api.WorkerLostCode) => void;
  /** Sign-out, or Clerk ended the session: the phone is nobody's. */
  reset: () => void;
};

export const useShopWorker = create<ShopWorkerState>()(
  persist(
    (set, get) => ({
      shared: false,
      shopName: null,
      worker: null,
      notice: null,

      enter: async (shopName) => {
        const push = usePush.getState();
        const token = push.token;
        if (token) {
          // While the login is still the Owner's own, so GRIDGO accepts it.
          await api.unregisterDevice(token).catch(() => undefined);
        }
        usePush.setState({ token: null, claimed: false });
        setSharedDevice(true);
        api.setWorkerToken(null);
        useAlertsStore.getState().bindOwner(null);
        useToasts.getState().clear();
        set({ shared: true, shopName, worker: null, notice: null });
        useSession.getState().lockDevice();
      },

      select: async (pinStaffId, pin) => {
        try {
          const picked = await api.selectWorker(pinStaffId, pin);
          api.setWorkerToken(picked.token);
          set({ worker: picked.worker, notice: null, shared: true });
          setSharedDevice(true);
          await useSession.getState().adoptWorker();
          return null;
        } catch (error) {
          return pickProblem(error);
        }
      },

      lock: async () => {
        // GRIDGO locks by this login's device session, so the call needs no
        // worker token; the phone is handed back at once, before the answer.
        set({ worker: null, notice: null });
        api.setWorkerToken(null);
        useSession.getState().lockDevice();
        // Best effort: an expired turn is already locked, and GRIDGO never
        // falls back to the Owner either way.
        await api.lockWorker().catch(() => undefined);
      },

      lost: (code) => {
        if (!get().shared && code === "shop_device_session_required") return;
        const hadWorker = get().worker != null;
        set({ shared: true, worker: null, notice: hadWorker ? "timed_out" : get().notice });
        setSharedDevice(true);
        useSession.getState().lockDevice();
      },

      reset: () => {
        api.setWorkerToken(null);
        setSharedDevice(false);
        set({ shared: false, shopName: null, worker: null, notice: null });
      },
    }),
    {
      name: "gridgo.supplier.shopWorker",
      storage: createPersistStorage<ShopWorkerState>(),
      partialize: (state) => ({ shared: state.shared, shopName: state.shopName }) as ShopWorkerState,
      onRehydrateStorage: () => (state) => {
        if (!state?.shared) return;
        setSharedDevice(true);
        // A session restored before this store finished reading must not keep
        // the login's own screens open on a shared phone.
        const session = useSession.getState();
        if (session.identity.kind === "supplier" && !session.user?.worker) session.lockDevice();
      },
    },
  ),
);

/** A refused pick, in words. The PIN itself is never repeated back. */
export function pickProblem(error: unknown): string {
  switch (apiErrorCode(error)) {
    case "shop_pin_invalid":
    case "invalid_shop_pin":
      return "That PIN is not right. Try again.";
    case "shop_pin_rate_limited":
      return "Too many wrong PINs. Wait 15 minutes, or ask the owner for a new PIN.";
    case "shop_member_not_found":
    case "invalid_shop_worker_selection":
      return "This person is no longer on the team. Ask the owner.";
    case "shop_device_session_required":
      return "Sign in again on this phone, then pick yourself.";
    default:
      return humanizeApiError(error, offlineMessage("check your PIN"));
  }
}

api.setWorkerLostHandler((code) => useShopWorker.getState().lost(code));

// Signing out, being signed out, or Clerk ending the session: nobody is working here.
useSession.subscribe((state, previous) => {
  if (state.identity.kind === previous.identity.kind) return;
  if (state.identity.kind === "signed_out") useShopWorker.getState().reset();
});
