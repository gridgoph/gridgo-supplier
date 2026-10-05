/**
 * Supplier agreement terms the app states where a shop accepts them.
 *
 * The agreement itself lives outside the apps, so its wording is the captain's
 * to approve, not this repo's to write. Paste approved text in verbatim; a term
 * left `null` draws nothing (gridgo-supplier#99).
 */

/**
 * No subcontracting: a shop declines what it cannot make in-house and never
 * passes an accepted order to another shop. Approved wording, 4 Oct 2026.
 * Shops that applied before it are not asked to accept it again.
 */
export const NO_SUBCONTRACTING_TERM: string | null =
  "You make every order you accept in your own shop, with your own equipment. Decline any order you cannot make in-house, whether you lack the materials, the equipment or the skill, and never pass an accepted order to another shop.";

/**
 * The same term as one line on the job Accept screen, where passing an order
 * on would actually happen. A reminder of the agreed term, not new wording.
 */
export const NO_SUBCONTRACTING_ACCEPT_LINE =
  "You make this job in your own shop, with your own equipment, and never pass it to another shop.";

/** The terms that are live, in the order they are read. */
export function supplierTerms(terms: readonly (string | null)[] = [NO_SUBCONTRACTING_TERM]): string[] {
  return terms.filter((term): term is string => Boolean(term?.trim()));
}
