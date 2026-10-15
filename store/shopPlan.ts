import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Closures an earlier version of the app kept on this phone only.
 *
 * GRIDGO now holds closure dates itself (`store/shopHours.ts`). What is left
 * here was never sent, so Shop hours offers to add it to GRIDGO or delete it,
 * and nothing else reads it — a closure GRIDGO cannot see must not mark a day
 * shut anywhere in the app.
 *
 * The old app kept them per phone, not per account. So the first shop signed
 * in after this update claims them (`ownerId`), they are offered to that shop
 * only, and the session store deletes them when that shop signs out or another
 * one signs in.
 */
export type PhoneOnlyClosure = {
  id: string;
  /** Local day keys, inclusive. */
  startDay: string;
  endDay: string;
};

type ShopPlanState = {
  blackouts: PhoneOnlyClosure[];
  ownerId: string | null;
  /** Gives unclaimed closures to this account. Closures another account claimed are deleted. */
  claimBlackouts: (userId: string) => void;
  clearBlackouts: () => void;
};

export const useShopPlan = create<ShopPlanState>()(
  persist(
    (set, get) => ({
      blackouts: [],
      ownerId: null,
      claimBlackouts: (userId) => {
        const { blackouts, ownerId } = get();
        if (!blackouts.length || ownerId === userId) return;
        set(ownerId == null ? { ownerId: userId } : { blackouts: [], ownerId: null });
      },
      clearBlackouts: () => set({ blackouts: [], ownerId: null }),
    }),
    {
      name: "gridgo.supplier.shopPlan",
      storage: createPersistStorage<ShopPlanState>(),
      partialize: (state) => ({ blackouts: state.blackouts, ownerId: state.ownerId }) as ShopPlanState,
    },
  ),
);

/** The closures this account may see; none that another account claimed. */
export function phoneOnlyClosuresFor(state: Pick<ShopPlanState, "blackouts" | "ownerId">, userId: string | null) {
  return userId != null && state.ownerId === userId ? state.blackouts : [];
}

/** Runs once the saved closures are loaded, so loading cannot undo a change made before it. */
export function afterShopPlanLoads(run: () => void): void {
  const store = useShopPlan.persist;
  if (!store || store.hasHydrated()) run();
  else {
    const stop = store.onFinishHydration(() => {
      stop();
      run();
    });
  }
}
