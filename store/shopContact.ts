import { create } from "zustand";

import * as api from "@/lib/api";

/**
 * The shop's contact person, as GRIDGO holds it (`/me/supplier-profile`).
 *
 * Account names this person on the "Your shop details" card, which is the way
 * into changing it. The session cannot carry it: `/auth/me`'s `name` is the
 * sign-in's own name, copied from Clerk, and saving the contact person never
 * touches it — so Account kept showing the name typed at sign-up after a
 * shop changed its contact person (gridgo-supplier#217). Shop details `adopt`s
 * what it just saved so Account has it the moment the shop goes back; Account
 * `load`s on focus for a change made anywhere else.
 *
 * Never persisted, and `reset` with the account like the shop's hours.
 */
type ShopContactState = {
  contactName: string | null;
  load: () => Promise<void>;
  adopt: (profile: Pick<api.SupplierProfile, "contactName">) => void;
  reset: () => void;
};

/** Bumped by `reset` and `adopt`; an older answer is discarded. */
let generation = 0;

function cleanName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const useShopContact = create<ShopContactState>((set) => ({
  contactName: null,

  load: async () => {
    const started = generation;
    try {
      const profile = await api.getSupplierProfile();
      if (started !== generation) return;
      set({ contactName: cleanName(profile.contactName) });
    } catch {
      // A read that did not land keeps the name already on screen; Account
      // falls back to the sign-in's name when there has never been one.
    }
  },

  adopt: (profile) => {
    generation += 1;
    set({ contactName: cleanName(profile.contactName) });
  },

  reset: () => {
    generation += 1;
    set({ contactName: null });
  },
}));
