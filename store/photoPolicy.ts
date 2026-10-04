import { create } from "zustand";

import type { Listing } from "@/lib/listings";
import {
  photoPolicyDue,
  type PhotoPolicyAnswer,
  type PhotoPolicyMoment,
} from "@/lib/photoPolicy";
import { askPhotoPolicy } from "@/store/sheets";

/**
 * Which listings the shop has confirmed the photo policies for, in the
 * submission now under way.
 *
 * In memory only, like the wizard itself: a confirmation is a reminder heard,
 * not a record GRIDGO keeps, and a killed app asking once more costs nothing.
 * A listing leaves this list when it goes on the board, so its next
 * submission asks again.
 */

type PhotoPolicyState = {
  confirmed: string[];
};

export const usePhotoPolicy = create<PhotoPolicyState>(() => ({
  confirmed: [],
}));

/**
 * Show the checkpoint if this submission has not confirmed it yet.
 *
 * Resolves "confirmed" straight away when it has, so a caller can always
 * await this before the work it guards.
 */
export async function ensurePhotoPolicy(
  listing: Pick<Listing, "id" | "photos">,
  moment: PhotoPolicyMoment,
): Promise<PhotoPolicyAnswer> {
  if (!photoPolicyDue(listing, usePhotoPolicy.getState().confirmed, moment)) {
    return "confirmed";
  }
  const answer = await askPhotoPolicy({ moment });
  if (answer === "confirmed") {
    usePhotoPolicy.setState((state) => ({
      confirmed: state.confirmed.includes(listing.id)
        ? state.confirmed
        : [...state.confirmed, listing.id],
    }));
  }
  return answer;
}

/** The submission is over (the listing went up): the next one asks again. */
export function endPhotoPolicySubmission(listingId: string): void {
  usePhotoPolicy.setState((state) => ({
    confirmed: state.confirmed.filter((id) => id !== listingId),
  }));
}
