/**
 * A shop sells only what it makes in its own shop (gridgo-supplier#99).
 *
 * A category is a shelf, not a promise: choosing "Marketing & promotional
 * collateral" does not commit a shop to brochures because it prints flyers.
 * Shops read it the other way round, so onboarding and the listing picker both
 * say it in plain words, and onboarding shows what sits on each shelf.
 */

export type CategoryProduct = {
  code: string;
  name: string;
  /** What the product covers, in the catalogue's own words. */
  examples: string;
};

/** Onboarding's "What you print" step, above the categories. */
export const IN_HOUSE_ONBOARDING = {
  title: "Only what you make in your own shop",
  body:
    "Pick a category if you make at least one of its products yourself. You don't have to offer " +
    "everything in it — you choose exactly what to sell when you add listings.",
} as const;

/** The listing picker's "What kind of work" hint. */
export const IN_HOUSE_LISTING =
  "Pick only work you make in your own shop. You don't need a listing for everything in this category.";

/** "Flyers, Brochures, Business cards" — every product named, in catalogue order. */
export function productNames(products: readonly CategoryProduct[]): string {
  return products.map((product) => product.name).join(", ");
}

/** The disclosure under a category, closed and open. */
export function productsToggleLabel(count: number, open: boolean): string {
  if (open) return "Hide the details";
  return count === 1 ? "What this product covers" : `What these ${count} products cover`;
}
