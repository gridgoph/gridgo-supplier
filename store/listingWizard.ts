import { create } from "zustand";

import type { WizardStepId } from "@/lib/listingWizard";

/**
 * The hidden listing this session is still walking through.
 *
 * In memory only — "this session" is the running app, not a draft that
 * survives a kill. Opening a live listing from the board never writes here.
 */

type ListingWizardState = {
  listingId: string | null;
  step: WizardStepId;
  furthest: WizardStepId;
  remember: (listingId: string, step: WizardStepId) => void;
  setStep: (step: WizardStepId) => void;
  /** Drop a draft only if it is this listing — a remove must not wipe another walk. */
  forget: (listingId: string) => void;
  clear: () => void;
};

export const useListingWizard = create<ListingWizardState>((set) => ({
  listingId: null,
  step: "pick",
  furthest: "pick",
  remember: (listingId, step) =>
    set((current) => ({
      listingId,
      step,
      furthest: laterStep(current.furthest, step),
    })),
  setStep: (step) =>
    set((current) => ({
      step,
      furthest: laterStep(current.furthest, step),
    })),
  forget: (listingId) =>
    set((current) =>
      current.listingId === listingId ? { listingId: null, step: "pick", furthest: "pick" } : current,
    ),
  clear: () => set({ listingId: null, step: "pick", furthest: "pick" }),
}));

const ORDER: WizardStepId[] = [
  "pick",
  "about",
  "price",
  "speed",
  "steps",
  "artwork",
  "review",
];

function laterStep(current: WizardStepId, next: WizardStepId): WizardStepId {
  return ORDER.indexOf(next) > ORDER.indexOf(current) ? next : current;
}
