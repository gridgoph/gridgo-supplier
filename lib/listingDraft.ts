import {
  asksQuantity,
  measurementKind,
  printerMaxWidthFeetForPayload,
  type Listing,
} from "@/lib/listings";
import type { ListingPatch } from "@/lib/listingsApi";
import {
  COLOUR_LAYOUT_NEEDED,
  colourDraftFrom,
  readColourDraft,
  sameColourDraft,
  type ColourDraft,
} from "@/lib/colourPricing";
import { parseMoney } from "@/lib/money";
import { samePrintLayouts, type PrintLayoutCode } from "@/lib/printLayout";
import { listingTimeFields, sameTime, timeFields, timeKey, type ProductionTime } from "@/lib/productionDays";

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
  printLayouts: PrintLayoutCode[];
  minimumOrderQuantity: number | null;
  priceTiers: Listing["priceTiers"];
  speedTiers: Listing["speedTiers"];
  turnaroundMode: Listing["turnaroundMode"];
  /** Hours or working days. Null while the listing follows its category line. */
  turnaround: ProductionTime | null;
  minimumTurnaround: ProductionTime | null;
  subcategoryCode: string;
  fileFormatMode: Listing["fileFormatMode"];
  formatCodes: string[];
  /** Null from a GRIDGO without colour pricing: nothing is shown or sent. */
  pricedByColour: boolean | null;
  oneColour: boolean;
  /** The tier table as typed; a blank price is a tier not offered. */
  colour: ColourDraft;
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
    printLayouts: listing.printLayouts,
    minimumOrderQuantity: listing.minimumOrderQuantity,
    priceTiers: listing.priceTiers,
    speedTiers: listing.speedTiers,
    turnaroundMode: listing.turnaroundMode,
    turnaround: listing.turnaround,
    minimumTurnaround: listing.minimumTurnaround ?? null,
    subcategoryCode: listing.subcategoryCode,
    fileFormatMode: listing.fileFormatMode,
    formatCodes: listing.formatCodes,
    pricedByColour: listing.colourSupported ? listing.pricedByColour === true : null,
    oneColour: listing.oneColour === true,
    colour: colourDraftFrom(listing.colourPricing ?? null),
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
    samePrintLayouts(left.printLayouts, right.printLayouts) &&
    left.minimumOrderQuantity === right.minimumOrderQuantity &&
    tierKey(left.priceTiers) === tierKey(right.priceTiers) &&
    speedKey(left.speedTiers) === speedKey(right.speedTiers) &&
    left.turnaroundMode === right.turnaroundMode &&
    sameTime(left.turnaround, right.turnaround) &&
    sameTime(left.minimumTurnaround, right.minimumTurnaround) &&
    left.subcategoryCode === right.subcategoryCode &&
    left.fileFormatMode === right.fileFormatMode &&
    left.formatCodes.join(",") === right.formatCodes.join(",") &&
    left.pricedByColour === right.pricedByColour &&
    left.oneColour === right.oneColour &&
    sameColourDraft(left.colour, right.colour)
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
    printLayouts: draft.printLayouts,
    minimumOrderQuantity: asksQuantity(draft.pricingUnit) ? draft.minimumOrderQuantity : null,
    priceTiers: asksQuantity(draft.pricingUnit) ? draft.priceTiers : [],
    speedTiers: draft.speedTiers,
    turnaroundMode: draft.turnaroundMode,
    turnaround: draft.turnaroundMode === "override" ? draft.turnaround : null,
    minimumTurnaround: draft.turnaroundMode === "override" ? draft.minimumTurnaround : null,
    subcategoryCode: draft.subcategoryCode,
    fileFormatMode: draft.fileFormatMode,
    formatCodes: draft.formatCodes,
    ...(draft.pricedByColour == null
      ? {}
      : (() => {
          const read = readColourDraft(draft.colour);
          return {
            pricedByColour: colourOn(draft),
            oneColour: oneColourOn(draft),
            colourPricing: colourOn(draft) && read.ok ? read.pricing : listing.colourPricing,
          };
        })()),
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
    printLayouts: working.printLayouts,
    minimumOrderQuantity: asksQuantity(working.pricingUnit) ? working.minimumOrderQuantity : null,
    priceTiers: asksQuantity(working.pricingUnit) ? working.priceTiers : [],
    speedTiers: working.speedTiers.map(({ turnaround, ...tier }) => ({
      ...tier,
      ...timeFields("turnaround", turnaround),
    })),
    turnaroundMode: working.turnaroundMode,
    ...(working.turnaroundMode === "override"
      ? listingTimeFields(working.minimumTurnaround, working.turnaround)
      : listingTimeFields(null, null)),
    subcategoryCode: working.subcategoryCode,
    ...colourPatch(working),
    ...(onTheBoard == null ? {} : { active: onTheBoard }),
  };
}

/** Priced by colour only per page: any other unit sends it off. */
export function colourOn(draft: Pick<ListingDraft, "pricedByColour" | "pricingUnit">): boolean {
  return draft.pricedByColour === true && draft.pricingUnit === "per_page";
}

/**
 * The one-colour warning belongs to a fixed-price per-page listing. A flag
 * kept on any other listing would warn clients by a rule nobody can see.
 */
export function oneColourOn(draft: Pick<ListingDraft, "pricedByColour" | "pricingUnit" | "oneColour">): boolean {
  return !colourOn(draft) && draft.pricingUnit === "per_page" && draft.oneColour;
}

/**
 * The colour fields a save sends. The table goes only while the listing is
 * priced by colour; switched off, it is left out so the shop's prices are kept
 * for when it comes back. A GRIDGO without colour pricing gets none of them.
 */
export function colourPatch(
  draft: ListingDraft,
): Pick<ListingPatch, "pricedByColour" | "oneColour" | "colourPricing"> {
  if (draft.pricedByColour == null) return {};
  if (!colourOn(draft)) return { pricedByColour: false, oneColour: oneColourOn(draft) };
  const read = readColourDraft(draft.colour);
  return { pricedByColour: true, oneColour: false, ...(read.ok ? { colourPricing: read.pricing } : {}) };
}

/**
 * Why a colour-priced draft cannot be sent yet: GRIDGO would refuse it, so it
 * is held on the phone with the first thing to fix. Null when it can go.
 */
export function colourHold(draft: ListingDraft): string | null {
  if (!colourOn(draft)) return null;
  const read = readColourDraft(draft.colour);
  if (!read.ok) return read.problem.message;
  if (!draft.printLayouts.length) return COLOUR_LAYOUT_NEEDED;
  return null;
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
    .map((tier) => `${timeKey(tier.turnaround)}:${tier.label}:${tier.priceMinor ?? "-"}:${tier.surchargeMinor ?? "-"}`)
    .join(",");
}
