import { create } from "zustand";

/**
 * Sign-up's skippable last step: open Get verified once, over To do, right
 * after the account exists (report F318781A). In memory only — a shop that
 * closes the app instead still has the To do card.
 */
type VerifyOfferState = {
  open: boolean;
  consume: () => void;
};

export const useVerifyOffer = create<VerifyOfferState>()((set) => ({
  open: false,
  consume: () => set({ open: false }),
}));

export function offerVerifyAfterSignup(): void {
  useVerifyOffer.setState({ open: true });
}
