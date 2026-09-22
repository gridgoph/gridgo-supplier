import {
  asksQuantity,
  measurementKind,
  printerMaxWidthFeetForPayload,
  type Listing,
} from "@/lib/listings";
import type { ListingPatch } from "@/lib/listingsApi";
import { parseMoney } from "@/lib/money";

/**
 * The words, price and times a shop holds until the foot is pressed.
 *
 * Shared by the live editor and the add-a-listing wizard so a half-typed name
 * is the same draft in both places. Steps, add-ons and choices are their own
 * records and save as they are added — they do not live here.
 */

/** A pack is usually round: 100, 500, 1000. Stepping by one would be cruel. */
export const PACK_STEP = 25;

export type ListingDraft = {
  name: string;
  description: string;
  /** Pesos as typed, so a half-typed "12." is not mangled. */
  price: string;
  pricingUnit: Listing["pricingUnit"];
  packageQty: number | null;
  measureUnit: Listing["measureUnit"];
  /** Smallest billable size, in whole units of `measureUnit` as the shop types them. */
  minimumWidth: number | null;
  minimumHeight: number | null;
  minimumLength: number | null;
  printerMaxWidthFeet: number | null;
  minimumOrderQuantity: number | null;
  priceTiers: Listing["priceTiers"];
  speedTiers: Listing["speedTiers"];
  turnaroundMode: Listing["turnaroundMode"];
  turnaroundHours: number | null;
  minimumTurnaroundHours: number | null;
  subcategoryCode: string;
  fileFormatMode: Listing["fileFormatMode"];
  formatCodes: string[];
};

export function draftFrom(listing: Listing): ListingDraft {
  return {
    name: listing.name,
    description: listing.description,
    price: listing.basePriceMinor ? (listing.basePriceMinor / 100).toFixed(2) : "",
    pricingUnit: listing.pricingUnit,
    packageQty: listing.packageQty,
    measureUnit: listing.measureUnit,
    minimumWidth: fromMilli(listing.minimumWidthMilli),
    minimumHeight: fromMilli(listing.minimumHeightMilli),
    minimumLength: fromMilli(listing.minimumLengthMilli),
    printerMaxWidthFeet: listing.printerMaxWidthFeet,
    minimumOrderQuantity: listing.minimumOrderQuantity,
    priceTiers: listing.priceTiers,
    speedTiers: listing.speedTiers,
    turnaroundMode: listing.turnaroundMode,
    turnaroundHours: listing.turnaroundHours,
    minimumTurnaroundHours: listing.minimumTurnaroundHours ?? null,
    subcategoryCode: listing.subcategoryCode,
    fileFormatMode: listing.fileFormatMode,
    formatCodes: listing.formatCodes,
  };
}

/** Whether anything a shop typed differs from what GRIDGO holds. */
export function sameDraft(left: ListingDraft, right: ListingDraft): boolean {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.price === right.price &&
    left.pricingUnit === right.pricingUnit &&
    left.packageQty === right.packageQty &&
    left.measureUnit === right.measureUnit &&
    left.minimumWidth === right.minimumWidth &&
    left.minimumHeight === right.minimumHeight &&
    left.minimumLength === right.minimumLength &&
    left.printerMaxWidthFeet === right.printerMaxWidthFeet &&
    left.minimumOrderQuantity === right.minimumOrderQuantity &&
    tierKey(left.priceTiers) === tierKey(right.priceTiers) &&
    speedKey(left.speedTiers) === speedKey(right.speedTiers) &&
    left.turnaroundMode === right.turnaroundMode &&
    left.turnaroundHours === right.turnaroundHours &&
    left.minimumTurnaroundHours === right.minimumTurnaroundHours &&
    left.subcategoryCode === right.subcategoryCode &&
    left.fileFormatMode === right.fileFormatMode &&
    left.formatCodes.join(",") === right.formatCodes.join(",")
  );
}

/**
 * The listing as it would be if the shop pressed save now.
 *
 * Completeness and the price line are read off this rather than off what GRIDGO
 * holds, so what a shop sees matches what it typed — a shop that has just
 * entered a price should not be told the listing has none.
 */
export function applyDraft(listing: Listing, draft: ListingDraft): Listing {
  const money = parseMoney(draft.price);
  return {
    ...listing,
    name: draft.name.trim(),
    description: draft.description.trim(),
    basePriceMinor: money.ok ? (money.minor ?? 0) : listing.basePriceMinor,
    pricingUnit: draft.pricingUnit,
    packageQty: packageQtyFor(draft.pricingUnit, draft.packageQty),
    // A field only exists while its unit does. Keeping a stale square-foot
    // minimum on a listing a shop just switched to per-piece would price the
    // next order off a rule nobody can see any more.
    measureUnit: measureUnitFor(draft.pricingUnit, draft.measureUnit),
    minimumWidthMilli: measurementKind(draft.pricingUnit) === "area" ? toMilli(draft.minimumWidth) : null,
    minimumHeightMilli: measurementKind(draft.pricingUnit) === "area" ? toMilli(draft.minimumHeight) : null,
    minimumLengthMilli: measurementKind(draft.pricingUnit) === "length" ? toMilli(draft.minimumLength) : null,
    printerMaxWidthFeet: printerMaxWidthFeetForPayload(
      draft.subcategoryCode,
      draft.printerMaxWidthFeet,
    ),
    minimumOrderQuantity: asksQuantity(draft.pricingUnit) ? draft.minimumOrderQuantity : null,
    priceTiers: asksQuantity(draft.pricingUnit) ? draft.priceTiers : [],
    speedTiers: draft.speedTiers,
    turnaroundMode: draft.turnaroundMode,
    turnaroundHours: draft.turnaroundMode === "override" ? draft.turnaroundHours : null,
    minimumTurnaroundHours:
      draft.turnaroundMode === "override" ? draft.minimumTurnaroundHours : null,
    subcategoryCode: draft.subcategoryCode,
    fileFormatMode: draft.fileFormatMode,
    formatCodes: draft.formatCodes,
  };
}

/** The PATCH the editor and the wizard both send. `active` only when asked. */
export function listingSavePatch(
  working: ListingDraft,
  moneyMinor: number,
  onTheBoard?: boolean,
): ListingPatch {
  return {
    name: working.name.trim(),
    description: working.description.trim(),
    basePriceMinor: moneyMinor,
    pricingUnit: working.pricingUnit,
    packageQty: packageQtyFor(working.pricingUnit, working.packageQty),
    measureUnit: measureUnitFor(working.pricingUnit, working.measureUnit),
    minimumWidthMilli:
      measurementKind(working.pricingUnit) === "area" ? toMilli(working.minimumWidth) : null,
    minimumHeightMilli:
      measurementKind(working.pricingUnit) === "area" ? toMilli(working.minimumHeight) : null,
    minimumLengthMilli:
      measurementKind(working.pricingUnit) === "length" ? toMilli(working.minimumLength) : null,
    printerMaxWidthFeet: printerMaxWidthFeetForPayload(
      working.subcategoryCode,
      working.printerMaxWidthFeet,
    ),
    minimumOrderQuantity: asksQuantity(working.pricingUnit) ? working.minimumOrderQuantity : null,
    priceTiers: asksQuantity(working.pricingUnit) ? working.priceTiers : [],
    speedTiers: working.speedTiers,
    turnaroundMode: working.turnaroundMode,
    turnaroundHours: working.turnaroundMode === "override" ? working.turnaroundHours : null,
    minimumTurnaroundHours:
      working.turnaroundMode === "override" ? working.minimumTurnaroundHours : null,
    subcategoryCode: working.subcategoryCode,
    ...(onTheBoard == null ? {} : { active: onTheBoard }),
  };
}

export function formatsMoved(working: ListingDraft, baseline: Listing): boolean {
  return (
    working.fileFormatMode !== baseline.fileFormatMode ||
    working.formatCodes.join(",") !== baseline.formatCodes.join(",")
  );
}

/** Thousandths of the shop's measure unit, which is how the platform stores a size. */
export function toMilli(value: number | null): number | null {
  return value == null || value <= 0 ? null : Math.round(value * 1000);
}

export function fromMilli(value: number | null): number | null {
  return value == null ? null : value / 1000;
}

export function needsMeasure(unit: Listing["pricingUnit"]): boolean {
  const kind = measurementKind(unit);
  return kind === "area" || kind === "length";
}

/**
 * GRIDGO refuses per-area / per-length without a measure unit. The price
 * step shows feet as selected; write that same default so Proceed does not
 * send `measureUnit: null` and come back 400.
 */
export function measureUnitFor(
  unit: Listing["pricingUnit"],
  current: Listing["measureUnit"],
): Listing["measureUnit"] {
  return needsMeasure(unit) ? current ?? "ft" : null;
}

/**
 * A pack must be at least two. Pack qty lives on Speed, so Price Proceed
 * still has to send a legal count if the shop has not opened that stepper.
 */
export function packageQtyFor(
  unit: Listing["pricingUnit"],
  current: number | null,
): number | null {
  return unit === "per_package" ? current ?? 100 : null;
}

/** What choosing this unit means for the shop, and for what a client is asked. */
export function unitHint(unit: Listing["pricingUnit"]): string {
  switch (unit) {
    case "per_package": return "A price for a pack. You say how many are in one.";
    case "per_page": return "A price a page. The client says how many copies.";
    case "per_area": return "A price a square unit. The client gives a width and a height.";
    case "per_length": return "A price a unit of length. The client gives one measurement.";
    case "whole_job": return "One price for the whole thing. No quantity is asked.";
    default: return "A price each. The client says how many.";
  }
}

function tierKey(tiers: Listing["priceTiers"]): string {
  return tiers.map((tier) => `${tier.minQuantity}:${tier.unitPriceMinor}`).join(",");
}

function speedKey(tiers: Listing["speedTiers"]): string {
  return tiers
    .map((tier) => `${tier.turnaroundHours}:${tier.label}:${tier.priceMinor ?? "-"}:${tier.surchargeMinor ?? "-"}`)
    .join(",");
}
