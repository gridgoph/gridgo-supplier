/**
 * Is a held picture link still good?
 *
 * Every picture this app draws from GRIDGO (a sample, a filed proof, a wallet
 * receipt, the payout QR, the client's artwork) reaches the phone as a signed
 * link that storage honours for five minutes. A screen holds that link in
 * state, and the app can sit in the background far longer than that — so on
 * resume it still draws links storage now answers with `403 Request has
 * expired`, and the picture used to latch "will not load" or "Preview
 * unavailable". Nothing was wrong with the file; the link was old
 * (gridgo-supplier#84, the same bug as gridgo-client#111).
 *
 * The fix is never a longer-lived link (that is a security trade on the
 * server): it is reading the link again when what is held is stale. This
 * module only answers "stale?". `hooks/useSignedLink.ts` owns the re-read for a
 * picture that knows only its file id; `hooks/usePhotoLinkRefresh.ts` owns it
 * for a screen holding board listings.
 */

import type { SamplePhoto } from "@/lib/listings";

/**
 * How close to expiry a link counts as stale already. A large photo on mobile
 * data can take seconds to arrive, and a link that expires mid-transfer is as
 * dead as one that already has. The same minute `photoViewUrl` has always used.
 */
export const PHOTO_LINK_MARGIN_MS = 60_000;

/**
 * How old a held read may be before a resume reads it again regardless of what
 * its links say: the five-minute signing window less the margin above, so a
 * read with no expiry stamped on it is still refreshed before its links die.
 */
export const HELD_READ_MAX_AGE_MS = 240_000;

/** Milliseconds since epoch a board photo's link expires, or null when it does not say. */
export function photoLinkExpiry(
  photo: Pick<SamplePhoto, "downloadUrlExpiresAt"> | null | undefined,
): number | null {
  const stamp = photo?.downloadUrlExpiresAt;
  if (!stamp) return null;
  const at = Date.parse(stamp);
  return Number.isFinite(at) ? at : null;
}

/**
 * True when a link expiring at `expiresAt` has expired or will within the
 * margin. A link with no known expiry is not called stale: there is nothing to
 * go on, and a re-read on a guess is a request loop waiting to happen.
 */
export function linkIsStale(expiresAt: number | null, now: number = Date.now()): boolean {
  return expiresAt !== null && expiresAt - now <= PHOTO_LINK_MARGIN_MS;
}

/** The soonest any photo on these listings expires, or null when none says. */
export function earliestPhotoExpiry(
  listings: readonly ({ photos: readonly SamplePhoto[] } | null | undefined)[],
): number | null {
  let earliest: number | null = null;
  for (const listing of listings) {
    for (const photo of listing?.photos ?? []) {
      const at = photoLinkExpiry(photo);
      if (at !== null && (earliest === null || at < earliest)) earliest = at;
    }
  }
  return earliest;
}

/**
 * Should a screen coming back to the foreground read again what it holds?
 *
 * Yes when the read is older than `HELD_READ_MAX_AGE_MS`, or when its earliest
 * link is stale. No when nothing is held — there is nothing to refresh, and the
 * screen's own load will run.
 */
export function heldReadIsStale(
  held: { readAt: number | null; earliestExpiry: number | null },
  now: number = Date.now(),
): boolean {
  if (held.readAt === null) return false;
  if (now - held.readAt >= HELD_READ_MAX_AGE_MS) return true;
  return linkIsStale(held.earliestExpiry, now);
}
