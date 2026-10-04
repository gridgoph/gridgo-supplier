/**
 * Supplier agreement terms the app states where a shop accepts them.
 *
 * The agreement itself lives outside the apps, so its wording is the captain's
 * to approve, not this repo's to write. A term stays `null` — and nothing is
 * drawn — until the approved text is pasted in here (gridgo-supplier#99).
 */

/**
 * No subcontracting: a shop declines what it cannot make in-house and never
 * passes an accepted order to another shop. Awaiting the approved wording.
 */
export const NO_SUBCONTRACTING_TERM: string | null = null;

/** The terms that are live, in the order they are read. */
export function supplierTerms(terms: readonly (string | null)[] = [NO_SUBCONTRACTING_TERM]): string[] {
  return terms.filter((term): term is string => Boolean(term?.trim()));
}
