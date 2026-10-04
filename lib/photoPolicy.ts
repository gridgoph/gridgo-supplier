import type { Listing } from "@/lib/listings";

/**
 * Photo policies — the three rules every sample photo is held to.
 *
 * Not a new rule: Operations already sends back a sample with a watermark, a
 * logo or the shop's own branding on it. This is the reminder at the moment it
 * is useful, so a shop hears it before a review round is spent on it rather
 * than after.
 *
 * One confirm covers every photo on the listing, once per submission. A
 * submission is one listing's walk from hidden to on the board: confirming at
 * the photo step means Place on Board does not ask again, and the next time
 * that listing goes up it asks afresh.
 */

export type PhotoPolicyRule = {
  key: "watermark" | "logo" | "branding";
  title: string;
  /** A concrete example of what breaks it, in a shop's own terms. */
  example: string;
};

export const PHOTO_POLICY_RULES: readonly PhotoPolicyRule[] = [
  {
    key: "watermark",
    title: "No watermark",
    example: "No text or marks laid across the picture, faint or bold.",
  },
  {
    key: "logo",
    title: "No logo",
    example: "Your shop's logo stays out of the frame, corners included.",
  },
  {
    key: "branding",
    title: "No shop branding",
    example: "No shop name, phone number, page link or QR code in the shot.",
  },
];

export const PHOTO_POLICY_TITLE = "Photo policies";

export const PHOTO_POLICY_BODY =
  "GRIDGO looks at every sample before a client sees it. A photo that breaks one of these comes back to you to replace.";

/** What is fine, said once, so the rules do not read as "no photos". */
export const PHOTO_POLICY_ALLOWED = "Just the print, shot plain";

/** The single confirm. Covers every photo on the listing. */
export const PHOTO_POLICY_CONFIRM = "My photos follow these rules";

/**
 * Where the checkpoint is shown.
 *
 * `photos` — about to add or replace a sample; backing out keeps the shop on
 * its photos. `submit` — about to put the listing up; backing out offers the
 * photos, so the way out is a next step rather than a dead end.
 */
export type PhotoPolicyMoment = "photos" | "submit";

export type PhotoPolicyAnswer = "confirmed" | "check_photos" | "declined";

export function photoPolicyDecline(moment: PhotoPolicyMoment): string {
  return moment === "submit" ? "Check my photos" : "Not now";
}

/**
 * Whether this moment needs the checkpoint.
 *
 * Already confirmed in this submission: no. Submitting a listing with no
 * photo has nothing to check (GRIDGO refuses it for the missing photo anyway).
 */
export function photoPolicyDue(
  listing: Pick<Listing, "id" | "photos">,
  confirmed: readonly string[],
  moment: PhotoPolicyMoment,
): boolean {
  if (confirmed.includes(listing.id)) return false;
  if (moment === "submit" && listing.photos.length === 0) return false;
  return true;
}
