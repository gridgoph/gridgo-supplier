import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Closures an earlier version of the app kept on this phone only.
 *
 * GRIDGO now holds closure dates itself (`store/shopHours.ts`). What is left
 * here was never sent, so Shop hours offers to add it to GRIDGO or delete it,
 * and nothing else reads it — a closure GRIDGO cannot see must not mark a day
 * shut anywhere in the app. It carries no account, so the session store deletes
 * it when the signed-in shop signs out or changes.
 */
export type PhoneOnlyClosure = {
  id: string;
  /** Local day keys, inclusive. */
  startDay: string;
  endDay: string;
};

type ShopPlanState = {
  blackouts: PhoneOnlyClosure[];
  clearBlackouts: () => void;
};

export const useShopPlan = create<ShopPlanState>()(
  persist(
    (set) => ({
      blackouts: [],
      clearBlackouts: () => set({ blackouts: [] }),
    }),
    {
      name: "gridgo.supplier.shopPlan",
      storage: createPersistStorage<ShopPlanState>(),
      partialize: (state) => ({ blackouts: state.blackouts }) as ShopPlanState,
    },
  ),
);
