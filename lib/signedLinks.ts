import * as api from "@/lib/api";
import { linkIsStale } from "@/lib/photoLinks";

/**
 * A viewing link for one stored file, as this phone received it.
 *
 * Both times are on the phone's own clock: `expiresAt` is counted from
 * `expiresInSeconds` at arrival, not read from the server's timestamp, so a
 * phone whose clock runs ahead of GRIDGO's never sees a fresh link as expired.
 */
export type SignedLink = { url: string; readAt: number; expiresAt: number };

/**
 * Links held in memory for as long as they are good. A two-column wall asks
 * for the same eight photos every time the screen regains focus, and asking
 * again for a link that has not expired is a request a shop on mobile data
 * pays for twice. Never persisted: a link is a capability, not identity.
 */
const links = new Map<string, SignedLink>();
const inflight = new Map<string, Promise<SignedLink | null>>();

/** A link already in hand and not stale, without a round trip. Null means one is needed. */
export function heldLink(fileId: string | null | undefined): SignedLink | null {
  if (!fileId) return null;
  const held = links.get(fileId);
  return held && !linkIsStale(held.expiresAt) ? held : null;
}

/**
 * A viewing link for `fileId`, from memory when one is still good.
 *
 * `force` skips memory: the picture has already failed on the held link, or
 * the phone is back from the background with a link it can no longer trust.
 * Two pictures of the same file asking at once share one request. Null when
 * GRIDGO would not sign one.
 */
export function signedLink(
  fileId: string,
  { force = false }: { force?: boolean } = {},
): Promise<SignedLink | null> {
  const held = force ? null : heldLink(fileId);
  if (held) return Promise.resolve(held);
  const pending = inflight.get(fileId);
  if (pending) return pending;

  const read = api.getDownloadUrl(fileId).then(
    (link): SignedLink => {
      const now = Date.now();
      const seconds = Number.isFinite(link.expiresInSeconds) ? link.expiresInSeconds : 60;
      const fresh = { url: link.url, readAt: now, expiresAt: now + seconds * 1000 };
      links.set(fileId, fresh);
      return fresh;
    },
    () => null,
  );
  const settled = read.finally(() => inflight.delete(fileId));
  inflight.set(fileId, settled);
  return settled;
}

/** The longest storage ever honours a link, so a server stamp can never outlive it here. */
const SIGNING_WINDOW_MS = 300_000;

/**
 * Keep a link that arrived inside a record (an order's progress photos), so
 * the picture draws without asking for another. Never replaces a link already
 * held, and the phone's own clock caps it at the signing window: a server
 * stamp read on a phone running behind would otherwise look good for longer
 * than storage will honour it.
 */
export function rememberLink(fileId: string, url: string | null | undefined, expiresAtIso: string | null | undefined): void {
  if (!fileId || !url || heldLink(fileId)) return;
  const stamped = expiresAtIso ? Date.parse(expiresAtIso) : Number.NaN;
  if (!Number.isFinite(stamped)) return;
  const now = Date.now();
  const expiresAt = Math.min(stamped, now + SIGNING_WINDOW_MS);
  if (linkIsStale(expiresAt, now)) return;
  links.set(fileId, { url, readAt: now, expiresAt });
}
