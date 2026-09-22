import { parseMoney } from "@/lib/money";
import {
  FORMATS_NEEDED,
  NAME_NEEDED,
  PHOTO_NEEDED,
  effectiveFormatCodes,
  effectiveTurnaroundHours,
  editorGuidance,
  isPrinterCapSet,
  needsPrinterCap,
  type BoardContext,
  type Listing,
} from "@/lib/listings";
import { applyDraft, type ListingDraft } from "@/lib/listingDraft";

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
  pick: "Pick printing category",
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

export function productionHours(
  draft: ListingDraft,
  inheritedHours: number | null,
): { min: number; max: number } {
  const max = draft.turnaroundHours ?? inheritedHours ?? 24;
  const min = draft.minimumTurnaroundHours ?? max;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export function speedReady(listing: Listing, draft: ListingDraft, context: BoardContext): boolean {
  const { min, max } = productionHours(draft, context.inheritedTurnaroundHours);
  return min >= 1 && max >= min;
}

export function speedGuidance(listing: Listing, draft: ListingDraft, context: BoardContext): string | null {
  const merged = applyDraft(listing, draft);
  return editorGuidance(merged, context).find((line) =>
    line.includes("turnaround") || line.includes("hours this takes") || line.includes("usual"),
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
