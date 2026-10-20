import { parseMoney } from "@/lib/money";
import {
  FORMATS_NEEDED,
  NAME_NEEDED,
  PHOTO_NEEDED,
  effectiveFormatCodes,
  editorGuidance,
  isPrinterCapSet,
  needsPrinterCap,
  type BoardContext,
  type Listing,
} from "@/lib/listings";
import { applyDraft, colourHold, colourOn, shownProductionTime, type ListingDraft } from "@/lib/listingDraft";
import { COLOUR_PRICES_NEEDED, readColourDraft } from "@/lib/colourPricing";
import { DEFAULT_DAYS_CHOICE, choiceProblem, type ProductionChoice } from "@/lib/productionDays";

/**
 * The add-a-listing interview, in the order a shop walks it.
 *
 * A later PrintZone process step may be inserted after interview notes land.
 * Do not stub a fake step for it here — the rail is these seven until then.
 */

export const WIZARD_STEPS = [
  { id: "pick", label: "Pick" },
  { id: "about", label: "About" },
  { id: "price", label: "Price" },
  { id: "speed", label: "Speed" },
  { id: "steps", label: "Steps" },
  { id: "artwork", label: "Artwork" },
  { id: "review", label: "Review" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export const WIZARD_STEP_IDS: readonly WizardStepId[] = WIZARD_STEPS.map((step) => step.id);

export const WIZARD_TITLES: Record<WizardStepId, string> = {
  pick: "Pick a product type",
  about: "Describe your product",
  price: "Set your product price",
  speed: "Set your capacity & speed",
  steps: "How will the client choose?",
  artwork: "How can the client help you?",
  review: "Finalize your product",
};

export function wizardStepIndex(id: WizardStepId): number {
  return WIZARD_STEP_IDS.indexOf(id);
}

export function pickReady(input: {
  categoryCode: string | null;
  subcategoryCode: string | null;
  printerMaxWidthFeet: number | null;
}): boolean {
  if (!input.categoryCode || !input.subcategoryCode) return false;
  if (needsPrinterCap(input.subcategoryCode) && !isPrinterCapSet(input.printerMaxWidthFeet)) {
    return false;
  }
  return true;
}

export function aboutBlocker(listing: Listing, name: string): string | null {
  if (!listing.photos.length) return PHOTO_NEEDED;
  if (!name.trim()) return NAME_NEEDED;
  return null;
}

/** A price GRIDGO will accept as typed. Empty is not set; ₱0 fails parseMoney. */
export function priceReady(price: string): boolean {
  const money = parseMoney(price);
  return money.ok && money.minor != null;
}

/**
 * What stops the Price step's Proceed, or null. A listing priced by colour
 * needs a readable table with at least one tier priced; any other listing
 * needs its one price.
 */
export function priceBlocker(draft: ListingDraft): string | null {
  if (colourOn(draft)) {
    const hold = colourHold(draft);
    if (hold) return hold;
    const read = readColourDraft(draft.colour);
    return read.ok && read.pricing.sizes.some((size) => Object.keys(size.prices).length)
      ? null
      : COLOUR_PRICES_NEEDED;
  }
  if (priceReady(draft.price)) return null;
  const money = parseMoney(draft.price);
  return money.ok ? "Set your price before it can go on the board." : money.error;
}

/**
 * The answer the production-time step shows and saves: the shop's own, else
 * GRIDGO's (its category line's usual time included), else two working days.
 */
export function wizardProductionTime(
  listing: Listing,
  draft: ListingDraft,
  context: BoardContext,
): ProductionChoice {
  return shownProductionTime(listing, draft, context.inheritedTurnaround) ?? DEFAULT_DAYS_CHOICE;
}

export function speedReady(listing: Listing, draft: ListingDraft, context: BoardContext): boolean {
  return choiceProblem(wizardProductionTime(listing, draft, context), listing.productionDayMinutes ?? undefined) == null;
}

export function speedGuidance(listing: Listing, draft: ListingDraft, context: BoardContext): string | null {
  const merged = applyDraft(listing, draft);
  return editorGuidance(merged, context).find((line) =>
    line.includes("production time") || line.includes("working days") || line.includes("usual"),
  ) ?? null;
}

export function artworkBlocker(listing: Listing, draft: ListingDraft, context: BoardContext): string | null {
  const merged = applyDraft(listing, draft);
  if (effectiveFormatCodes(merged, context.inheritedFormatCodes).length) return null;
  return FORMATS_NEEDED;
}

export function createListingName(input: {
  typedName: string;
  subcategoryName: string;
}): string {
  return input.typedName.trim() || input.subcategoryName.trim();
}
