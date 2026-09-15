/**
 * An order's reference, as a person reads it out.
 *
 * The platform names an order `ord_3ff0128e105a`. That is a database key,
 * and it reached every screen as one: a lowercase run of twelve hex digits
 * with a prefix that means nothing to a client. This is the same identity
 * set for people — prefix dropped, upper case, grouped in fours so it can be
 * read over a counter or typed into a chat with Operations without losing a
 * digit — and nothing else: no new number is minted, so what the client
 * quotes is exactly what Operations searches by.
 */

const PREFIX = /^ord[_-]/i;

/** "3FF0-128E-105A" for `ord_3ff0128e105a`; null when there is no id. */
export function orderReference(id: string | null | undefined): string | null {
  const raw = (id ?? "").trim();
  if (!raw) return null;
  const bare = raw.replace(PREFIX, "").toUpperCase();
  if (!bare) return null;
  if (!/^[0-9A-F]{8,}$/.test(bare)) return bare;
  return bare.match(/.{1,4}/g)?.join("-") ?? bare;
}

/** The reference as a screen reader should say it: digit groups, not a word. */
export function orderReferenceSpoken(id: string | null | undefined): string | null {
  const reference = orderReference(id);
  return reference ? `Order reference ${reference.replace(/-/g, " ")}` : null;
}
