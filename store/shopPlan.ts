import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Blackout } from "@/lib/blackouts";
import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Shop closures the schedule plans around.
 *
 * GRIDGO has no closure endpoint yet, so these are kept on this device. Every
 * surface that shows one repeats that, because a shop that believes Operations
 * is routing around a closure it cannot see would be misled by this screen.
 */

type ShopPlanState = {
  blackouts: Blackout[];
  hydrated: boolean;
  addBlackout: (blackout: Blackout) => void;
  updateBlackout: (id: string, patch: Partial<Omit<Blackout, "id">>) => void;
  removeBlackout: (id: string) => void;
  markHydrated: () => void;
};

const byStartDay = (a: Blackout, b: Blackout) => a.startDay.localeCompare(b.startDay);

export const useShopPlan = create<ShopPlanState>()(
  persist(
    (set) => ({
      blackouts: [],
      hydrated: false,
      addBlackout: (blackout) =>
        set((s) => ({ blackouts: [...s.blackouts, blackout].sort(byStartDay) })),
      updateBlackout: (id, patch) =>
        set((s) => ({
          blackouts: s.blackouts
            .map((b) => (b.id === id ? { ...b, ...patch } : b))
            .sort(byStartDay),
        })),
      removeBlackout: (id) =>
        set((s) => ({ blackouts: s.blackouts.filter((b) => b.id !== id) })),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gridgo.supplier.shopPlan",
      storage: createPersistStorage<ShopPlanState>(),
      partialize: (state) => ({ blackouts: state.blackouts }) as ShopPlanState,
      onRehydrateStorage: () => () => {
        useShopPlan.getState().markHydrated();
      },
    },
  ),
);

/** Stable-enough id without pulling in a uuid dependency. */
export function newBlackoutId(now: Date = new Date()): string {
  return `bo_${now.getTime().toString(36)}${Math.floor(Math.random() * 1e4)
    .toString(36)
    .padStart(3, "0")}`;
}
