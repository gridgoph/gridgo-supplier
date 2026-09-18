import { formatPhp } from "@/lib/api";
import { isActiveLine } from "@/lib/supplierServices";
import {
  resolveCategoryCode,
  type CatalogCategory,
  type CatalogCoverage,
  type ServiceCatalog,
} from "@/lib/taxonomy";

/**
 * The shop's board — what clients see.
 *
 * This is the only place a listing's raw shape is read, the same way
 * `lib/taxonomy.ts` is the only place the GRIDGO chart's shape is read. The
 * platform is building these routes in parallel with these screens, so every
 * field is read defensively and a renamed one costs one normaliser here rather
 * than a hunt through six screens.
 *
 * It is also where the shop-facing vocabulary lives, and that vocabulary is not
 * decoration. A shop owner does not have catalog items, SKUs, variants, option
 * groups or `kind=addon`; it has listings on a board, with steps a customer
 * walks and extras they can add. Two rules follow and both are load-bearing:
 *
 * - **A listing goes on the board or stays hidden.** The action is pinning it
 *   up; the standing chip is Live / Hidden / Not ready yet / Waiting for shop
 *   approval. "Publish" and "active" stay off the screen.
 * - **A blocker names the missing thing.** "Add at least one sample photo
 *   before it can go on the board", never a disabled button with no reason. A
 *   control that refuses without saying why is how a shop learns to stop
 *   pressing things.
 * - **The wall's standing comes from GRIDGO's `blockers`.** `boardStanding`
 *   reads that array (and `active`, service state, shop approval). The phone's
 *   fuller checklist (`boardBlockers` / `editorGuidance`) is editor guidance
 *   only — it must not decide the chip.
 *
 * The caps are the platform's (8 photos, 6 steps, 20 options each) and are
 * repeated here so a screen can stop a shop before GRIDGO has to.
 */

/**
 * How a shop sells the thing.
 *
 * It was two: a piece, or a pack. Three of the five shops on the platform
 * price work that cannot say -- a tarpaulin by the square foot, a plaque by the
 * inch of its height, a document by the page. The unit is what decides which
 * questions a client is asked, so getting it wrong means asking the wrong ones.
 */
export type PricingUnit =
  | "per_unit"
  | "per_package"
  | "per_page"
  | "per_area"
  | "per_length"
  | "whole_job";

export const PRICING_UNITS: readonly PricingUnit[] = [
  "per_unit", "per_package", "per_page", "per_area", "per_length", "whole_job",
] as const;

/** The unit a shop states its measurements in. Area is that unit squared. */
export type MeasureUnit = "mm" | "cm" | "in" | "ft" | "m";
export const MEASURE_UNITS: readonly MeasureUnit[] = ["mm", "cm", "in", "ft", "m"] as const;

/** A bulk break: at this many, the rate becomes this. */
export type PriceTier = { minQuantity: number; unitPriceMinor: number };

/**
 * A speed the shop sells. It either replaces the price outright -- hardbound is
 * PHP 250 at five days and PHP 700 at two hours, which are two prices for the
 * same book -- or adds a flat fee to the order, which is how a rush charge
 * works. Never both.
 */
export type SpeedTier = {
  id: string;
  label: string;
  turnaroundHours: number;
  priceMinor: number | null;
  surchargeMinor: number | null;
};

/** What a client has to be asked before this listing can be priced at all. */
export function measurementKind(unit: PricingUnit): "none" | "area" | "length" | "pages" {
  if (unit === "per_area") return "area";
  if (unit === "per_length") return "length";
  if (unit === "per_page") return "pages";
  return "none";
}

/** `whole_job` is one thing at one price: asking "how many" would be wrong. */
export function asksQuantity(unit: PricingUnit): boolean {
  return unit !== "whole_job";
}
export type TurnaroundMode = "inherit" | "override";
export type FileFormatMode = "inherit" | "override";

/** A step the customer walks, or an extra they can add. Same table, one word each. */
export type GroupKind = "spec" | "addon";

export const LISTING_CAPS = {
  photos: 8,
  specGroups: 6,
  optionsPerGroup: 20,
  prepSteps: 8,
  nameChars: 80,
  descriptionChars: 4000,
  optionLabelChars: 100,
  helpTextChars: 240,
} as const;

/** The only kind of work that names a printer's max width. */
export const TARP_SUBCATEGORY_CODE = "tarpaulins_outdoor_banners";

/** Whole feet the shop's machine can print, as GRIDGO stores it. */
export const PRINTER_MAX_WIDTH_FEET = { min: 1, max: 20 } as const;

export function needsPrinterCap(subcategoryCode: string): boolean {
  return subcategoryCode === TARP_SUBCATEGORY_CODE;
}

/** True when the shop has named a cap GRIDGO will accept. */
export function isPrinterCapSet(feet: number | null | undefined): feet is number {
  return (
    feet != null &&
    Number.isInteger(feet) &&
    feet >= PRINTER_MAX_WIDTH_FEET.min &&
    feet <= PRINTER_MAX_WIDTH_FEET.max
  );
}

/**
 * What goes on the wire for `printerMaxWidthFeet`.
 *
 * A number only for tarpaulin, and only when it is in range. Every other family
 * is `null` so a leftover 5 ft from a switched listing cannot hitch a ride.
 */
export function printerMaxWidthFeetForPayload(
  subcategoryCode: string,
  feet: number | null | undefined,
): number | null {
  if (!needsPrinterCap(subcategoryCode) || !isPrinterCapSet(feet)) return null;
  return feet;
}

/** "Prints up to 5 ft" — absent when the listing has no cap to show. */
export function printerCapLine(
  listing: Pick<Listing, "printerMaxWidthFeet">,
): string | null {
  return isPrinterCapSet(listing.printerMaxWidthFeet)
    ? `Prints up to ${listing.printerMaxWidthFeet} ft`
    : null;
}

export type SamplePhoto = {
  fileId: string;
  sortOrder: number;
  altText: string | null;
};

export type SpecOption = {
  id: string;
  label: string;
  /** Signed centavos added to the base price. Zero when this multiplies. */
  priceModifierMinor: number;
  /**
   * An extra that multiplies the price instead of adding to it, in basis
   * points — "x2 the price" is 20000.
   *
   * The shape a flat amount cannot hold: back-to-back doubles whatever the
   * price is now, where a flat amount has to be re-entered by hand every time
   * the price moves and in practice stops being right. An extra does one or
   * the other, never both.
   */
  priceMultiplierBps: number | null;
  active: boolean;
  sortOrder: number;
};

/** "x2", "x1.5" — a multiplier in the words a shop writes it in. */
export function multiplierLabel(bps: number): string {
  const times = bps / 10_000;
  return `x${Number.isInteger(times) ? times : times.toFixed(2).replace(/0+$/, "")}`;
}

/** Basis points from what a shop typed, or null when it is not a multiple. */
export function toMultiplierBps(text: string): number | null {
  const times = Number.parseFloat(text.trim().replace(/^x/i, ""));
  if (!Number.isFinite(times) || times <= 0) return null;
  const bps = Math.round(times * 10_000);
  return bps > 0 ? bps : null;
}

export type SpecGroup = {
  id: string;
  name: string;
  kind: GroupKind;
  required: boolean;
  helpText: string | null;
  sortOrder: number;
  options: SpecOption[];
  /**
   * The group's own version, not the listing's. Renaming a group, deleting it
   * and every option inside it are all checked against this one — sending the
   * item's version instead is a `409`, not a silent write.
   */
  version: number | null;
};

export type Listing = {
  id: string;
  /** The accredited category line this sits under. Matching still uses that. */
  serviceLineId: string;
  subcategoryCode: string;
  name: string;
  description: string;
  basePriceMinor: number;
  pricingUnit: PricingUnit;
  packageQty: number | null;
  /** Required by an area or length unit, meaningless to the others. */
  measureUnit: MeasureUnit | null;
  /** Smallest size the shop bills for, in thousandths of `measureUnit`. */
  minimumWidthMilli: number | null;
  minimumHeightMilli: number | null;
  minimumLengthMilli: number | null;
  /**
   * Widest the shop's machine can print, in whole feet.
   *
   * Required on tarpaulin & outdoor banners before the listing can go on the
   * board. Other families omit it — never a millimetre figure, and never a
   * leftover number after the kind of work changes.
   */
  printerMaxWidthFeet: number | null;
  /** The least the shop will run. */
  minimumOrderQuantity: number | null;
  priceTiers: PriceTier[];
  speedTiers: SpeedTier[];
  turnaroundMode: TurnaroundMode;
  turnaroundHours: number | null;
  fileFormatMode: FileFormatMode;
  /** The listing's own set when it overrides; otherwise what GRIDGO echoed back. */
  formatCodes: string[];
  /** The platform's `active`. Said in the shop's words everywhere else. */
  onTheBoard: boolean;
  sortOrder: number;
  photos: SamplePhoto[];
  groups: SpecGroup[];
  /**
   * GRIDGO's own completeness codes from the list/read payload (`blockers`).
   *
   * Null when this listing was built locally or an older payload omitted them —
   * standing then applies GRIDGO's rule to the fields we have. Never confuse
   * this with `boardBlockers`, which is editor guidance and stricter.
   */
  blockers?: string[] | null;
  /** Sent back on every write so two sessions cannot overwrite each other. */
  version: number | null;
  updatedAt: string | null;
};

/**
 * One thing a client does before it sends work.
 *
 * Not a size or a material — those are choices. This is the sequence a shop
 * wants walked before artwork arrives: flatten the layers, outline the fonts,
 * export the 3MF at the right scale. Numbered because the order is the point,
 * which is also why nothing here sorts by name.
 */
export type PrepStep = {
  id: string;
  title: string;
  /** What to actually do, in the shop's own words. */
  body: string;
  sortOrder: number;
};

export function normalizePrepSteps(body: unknown): PrepStep[] {
  return collection(body, "prepSteps", "steps", "items")
    .map((raw, index): PrepStep | null => {
      const id = str(pick(raw, "id", "stepId", "prepStepId"));
      const title = str(pick(raw, "title", "name"));
      if (!id || !title) return null;
      return {
        id,
        title,
        body: typeof raw.body === "string" ? raw.body : (str(pick(raw, "detail", "text")) ?? ""),
        sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
      };
    })
    .filter((step): step is PrepStep => step != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** One of GRIDGO's own starting points for a kind of work. */
export type ListingStarter = {
  id: string;
  name: string;
  subcategoryCode: string;
  pricingUnit: PricingUnit;
  packageQty: number | null;
  turnaroundHours: number | null;
  formatCodes: string[];
  /** What it brings, so the pick screen can say so before it is chosen. */
  specCount: number;
  addOnCount: number;
};

/* --------------------------------------------------------------------------
   Reading what GRIDGO sends
   -------------------------------------------------------------------------- */

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** First populated spelling wins, so a camelCase / snake_case rename is free. */
function pick(raw: Raw, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] != null) return raw[key];
  }
  return undefined;
}

function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((entry): entry is Raw => isRecord(entry)) : [];
}

/** The list under whichever key the payload wrapped it in. */
function collection(body: unknown, ...keys: string[]): Raw[] {
  if (Array.isArray(body)) return asArray(body);
  if (!isRecord(body)) return [];
  for (const key of keys) {
    if (Array.isArray(body[key])) return asArray(body[key]);
  }
  return [];
}

/** The single record under whichever key the payload wrapped it in. */
function single(body: unknown, ...keys: string[]): Raw | null {
  if (!isRecord(body)) return null;
  for (const key of keys) {
    const value = body[key];
    if (isRecord(value)) return value;
  }
  return isRecord(body) && str(pick(body, "id")) ? body : null;
}

function readOption(raw: Raw, index: number): SpecOption | null {
  const id = str(pick(raw, "id", "optionId"));
  const label = str(pick(raw, "label", "name"));
  if (!id || !label) return null;
  return {
    id,
    label,
    priceModifierMinor: num(pick(raw, "priceModifierMinor", "price_modifier_minor")) ?? 0,
    priceMultiplierBps: num(pick(raw, "priceMultiplierBps", "price_multiplier_bps")) ?? null,
    active: pick(raw, "active") !== false,
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
  };
}

function readGroup(raw: Raw, index: number): SpecGroup | null {
  const id = str(pick(raw, "id", "groupId", "optionGroupId"));
  const name = str(pick(raw, "name", "label"));
  if (!id || !name) return null;
  const kind = str(pick(raw, "kind")) === "addon" ? "addon" : "spec";
  return {
    id,
    name,
    kind,
    // An extra is optional by contract; only a step can be required.
    required: kind === "addon" ? false : pick(raw, "required") !== false,
    helpText: str(pick(raw, "helpText", "help_text")),
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
    version: num(pick(raw, "version")),
    options: asArray(pick(raw, "options"))
      .map(readOption)
      .filter((option): option is SpecOption => option != null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function readPhoto(raw: Raw, index: number): SamplePhoto | null {
  const fileId = str(pick(raw, "fileId", "file_id"));
  if (!fileId) return null;
  return {
    fileId,
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
    altText: str(pick(raw, "altText", "alt_text")),
  };
}

/** Photos may arrive as records or as bare file ids. Both are read. */
function readPhotos(value: unknown): SamplePhoto[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return (value as string[]).map((fileId, index) => ({
      fileId,
      sortOrder: index,
      altText: null,
    }));
  }
  return asArray(value)
    .map(readPhoto)
    .filter((photo): photo is SamplePhoto => photo != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function readPrinterCap(value: unknown): number | null {
  const feet = num(value);
  if (feet == null || !Number.isInteger(feet)) return null;
  return feet;
}

function readFormatCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const codes: string[] = [];
  for (const entry of value) {
    const code = typeof entry === "string" ? str(entry) : isRecord(entry) ? str(pick(entry, "code", "formatCode")) : null;
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** GRIDGO's completeness codes, or null when the payload did not send them. */
function readBlockers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function normalizeListing(body: unknown, index = 0): Listing | null {
  const raw = single(body, "item", "catalogItem", "listing") ?? (isRecord(body) ? body : null);
  if (!raw) return null;
  const id = str(pick(raw, "id", "itemId", "catalogItemId"));
  if (!id) return null;

  const declaredUnit = str(pick(raw, "pricingUnit", "pricing_unit"));
  const pricingUnit: PricingUnit = PRICING_UNITS.includes(declaredUnit as PricingUnit)
    ? (declaredUnit as PricingUnit)
    : "per_unit";
  const declaredMeasure = str(pick(raw, "measureUnit", "measure_unit"));
  const measureUnit: MeasureUnit | null = MEASURE_UNITS.includes(declaredMeasure as MeasureUnit)
    ? (declaredMeasure as MeasureUnit)
    : null;
  const turnaroundMode: TurnaroundMode =
    str(pick(raw, "turnaroundMode", "turnaround_mode")) === "override" ? "override" : "inherit";
  const fileFormatMode: FileFormatMode =
    str(pick(raw, "fileFormatMode", "file_format_mode")) === "override" ? "override" : "inherit";

  return {
    id,
    serviceLineId:
      str(pick(raw, "supplierServiceId", "supplier_service_id", "serviceId")) ?? "",
    subcategoryCode: str(pick(raw, "subcategoryCode", "subcategory_code")) ?? "",
    name: str(pick(raw, "name")) ?? "",
    description: typeof raw.description === "string" ? raw.description : "",
    basePriceMinor: num(pick(raw, "basePriceMinor", "base_price_minor")) ?? 0,
    pricingUnit,
    packageQty: num(pick(raw, "packageQty", "package_qty")),
    measureUnit,
    minimumWidthMilli: num(pick(raw, "minimumWidthMilli", "minimum_width_milli")),
    minimumHeightMilli: num(pick(raw, "minimumHeightMilli", "minimum_height_milli")),
    minimumLengthMilli: num(pick(raw, "minimumLengthMilli", "minimum_length_milli")),
    printerMaxWidthFeet: readPrinterCap(pick(raw, "printerMaxWidthFeet", "printer_max_width_feet")),
    minimumOrderQuantity: num(pick(raw, "minimumOrderQuantity", "minimum_order_quantity")),
    priceTiers: readPriceTiers(pick(raw, "priceTiers", "price_tiers")),
    speedTiers: readSpeedTiers(pick(raw, "speedTiers", "speed_tiers")),
    turnaroundMode,
    turnaroundHours: num(pick(raw, "turnaroundHours", "turnaround_hours")),
    fileFormatMode,
    formatCodes: readFormatCodes(
      pick(raw, "formatCodes", "format_codes", "fileFormats", "acceptedFormats"),
    ),
    onTheBoard: pick(raw, "active") !== false,
    sortOrder: num(pick(raw, "sortOrder", "sort_order")) ?? index,
    photos: readPhotos(pick(raw, "photos", "samplePhotos")),
    groups: asArray(pick(raw, "optionGroups", "option_groups", "groups"))
      .map(readGroup)
      .filter((group): group is SpecGroup => group != null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    blockers: readBlockers(pick(raw, "blockers")),
    version: num(pick(raw, "version", "expectedVersion")),
    updatedAt: str(pick(raw, "updatedAt", "updated_at")),
  };
}

export function normalizeListings(body: unknown): Listing[] {
  return collection(body, "items", "catalogItems", "listings")
    .map((raw, index) => normalizeListing(raw, index))
    .filter((listing): listing is Listing => listing != null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** One page of the board, exactly as GRIDGO ordered and counted it. */
export type BoardPage = {
  listings: Listing[];
  /** Feed back as `cursor` to ask for the page after this one. */
  nextCursor: string | null;
  /** How many listings match, across every page. */
  total: number;
};

/**
 * A page of the board.
 *
 * Deliberately *not* `normalizeListings`. That one re-sorts by the shop's own
 * wall order, which is the right answer when the whole board arrives at once
 * and the wrong one now: GRIDGO ranks a hunt, and sorts by name, quote or
 * ready-in, in PostgreSQL. Re-sorting a ranked page on the phone would put the
 * worst match first and quietly undo the sort the shop just picked.
 */
export function normalizeBoardPage(body: unknown): BoardPage {
  const listings = collection(body, "items", "catalogItems", "listings")
    .map((raw, index) => normalizeListing(raw, index))
    .filter((listing): listing is Listing => listing != null);
  const raw = body && typeof body === "object" ? (body as Raw) : {};
  const total = num(pick(raw, "total"));
  return {
    listings,
    nextCursor: str(pick(raw, "nextCursor", "next_cursor")),
    // No `total` means GRIDGO answered with a bare page; this page is all of it.
    total: total ?? listings.length,
  };
}

export function normalizeStarters(body: unknown): ListingStarter[] {
  return collection(body, "starters", "listingStarters", "items")
    .map((raw): ListingStarter | null => {
      const id = str(pick(raw, "id", "starterId"));
      const name = str(pick(raw, "name"));
      if (!id || !name) return null;
      const groups = asArray(pick(raw, "groups", "optionGroups", "starterGroups"));
      return {
        id,
        name,
        subcategoryCode: str(pick(raw, "subcategoryCode", "subcategory_code")) ?? "",
        pricingUnit:
          str(pick(raw, "defaultPricingUnit", "default_pricing_unit", "pricingUnit")) ===
          "per_package"
            ? "per_package"
            : "per_unit",
        packageQty: num(pick(raw, "defaultPackageQty", "default_package_qty", "packageQty")),
        turnaroundHours: num(
          pick(raw, "defaultTurnaroundHours", "default_turnaround_hours", "turnaroundHours"),
        ),
        formatCodes: readFormatCodes(
          pick(raw, "defaultFormatCodes", "default_format_codes", "formatCodes"),
        ),
        specCount: groups.filter((group) => str(pick(group, "kind")) !== "addon").length,
        addOnCount: groups.filter((group) => str(pick(group, "kind")) === "addon").length,
      };
    })
    .filter((starter): starter is ListingStarter => starter != null);
}

/**
 * The first position on a listing that nothing already holds.
 *
 * GRIDGO numbers a listing's steps, its choices and its prep steps by position
 * and refuses one that is already taken, so "put it at the end" cannot be the
 * count. Remove the first of three steps and the two that are left sit at 1 and
 * 2: the count is 2, which is taken, and a shop that never chose a position at
 * all is told its position is already used. The first free slot is the only
 * answer that survives a gap, and there is always one below the cap while the
 * cap has not been reached.
 */
export function nextFreeSlot(taken: readonly number[], cap: number): number {
  const used = new Set(taken);
  for (let slot = 0; slot < cap; slot += 1) if (!used.has(slot)) return slot;
  return cap - 1;
}

/* --------------------------------------------------------------------------
   What a listing says on screen
   -------------------------------------------------------------------------- */

export function specs(listing: Listing): SpecGroup[] {
  return listing.groups.filter((group) => group.kind === "spec");
}

export function addOns(listing: Listing): SpecGroup[] {
  return listing.groups.filter((group) => group.kind === "addon");
}

/**
 * How a client will be asked, said in three words.
 *
 * The captain's reference is a food-order sheet, and that is the right one: a
 * required single-select group is "Pick 1" and an optional one is something you
 * may add. Saying it the same way on the shop's editor and on the client's
 * order is what stops a shop being surprised by its own listing.
 */
export function pickLine(group: SpecGroup): string {
  return group.required ? "Pick 1" : "Optional";
}

/** The unit, in the words a shop and a client both use. */
export function unitLine(listing: Pick<Listing, "pricingUnit" | "packageQty" | "measureUnit">): string {
  switch (listing.pricingUnit) {
    case "per_package":
      return listing.packageQty ? `per pack of ${listing.packageQty}` : "per pack";
    case "per_page":
      return "per page";
    case "per_area":
      return listing.measureUnit ? `per sq.${listing.measureUnit}` : "per square unit";
    case "per_length":
      return listing.measureUnit ? `per ${listing.measureUnit}` : "per unit of length";
    case "whole_job":
      return "for the whole job";
    default:
      return "per piece";
  }
}

/** What the shop is choosing between, said plainly, for the price block. */
export function unitChoiceLabel(unit: PricingUnit): string {
  switch (unit) {
    case "per_package": return "Per pack";
    case "per_page": return "Per page";
    case "per_area": return "Per area";
    case "per_length": return "Per length";
    case "whole_job": return "Whole job";
    default: return "Per piece";
  }
}

function readPriceTiers(value: unknown): PriceTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!isRecord(row)) return null;
      const minQuantity = num(pick(row, "minQuantity", "min_quantity"));
      const unitPriceMinor = num(pick(row, "unitPriceMinor", "unit_price_minor"));
      if (!minQuantity || minQuantity < 1 || unitPriceMinor == null || unitPriceMinor < 0) return null;
      return { minQuantity, unitPriceMinor };
    })
    .filter((row): row is PriceTier => row !== null)
    .sort((left, right) => left.minQuantity - right.minQuantity);
}

function readSpeedTiers(value: unknown): SpeedTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, index) => {
      if (!isRecord(row)) return null;
      const turnaroundHours = num(pick(row, "turnaroundHours", "turnaround_hours"));
      if (!turnaroundHours || turnaroundHours < 1) return null;
      return {
        id: str(pick(row, "id")) ?? `speed_${index}`,
        label: str(pick(row, "label")) ?? `${turnaroundHours} hours`,
        turnaroundHours,
        priceMinor: num(pick(row, "priceMinor", "price_minor")),
        surchargeMinor: num(pick(row, "surchargeMinor", "surcharge_minor")),
      };
    })
    .filter((row): row is SpeedTier => row !== null)
    .sort((left, right) => left.turnaroundHours - right.turnaroundHours);
}

/**
 * The cheapest a customer can leave with.
 *
 * Base plus the cheapest option of every required step, floored at zero exactly
 * as the platform floors it. Never a struck-through "was" — a shop's board is
 * not a sale.
 */
export function fromPriceMinor(listing: Listing): number {
  const required = specs(listing).filter((group) => group.required);
  const additions = required.reduce((total, group) => {
    const active = group.options.filter((option) => option.active);
    if (!active.length) return total;
    return total + Math.min(...active.map((option) => option.priceModifierMinor));
  }, 0);
  return Math.max(0, listing.basePriceMinor + additions);
}

/** True when a required step can push the price above the base. */
export function hasPriceRange(listing: Listing): boolean {
  return specs(listing).some(
    (group) =>
      group.required &&
      group.options.filter((option) => option.active).length > 1,
  );
}

export function priceLine(listing: Listing): string {
  const from = fromPriceMinor(listing);
  const money = formatPhp(from);
  return hasPriceRange(listing) ? `From ${money} ${unitLine(listing)}` : `${money} ${unitLine(listing)}`;
}

/** What the shop's usual time means for this listing, in hours. */
export function effectiveTurnaroundHours(
  listing: Listing,
  inheritedHours: number | null,
): number | null {
  return listing.turnaroundMode === "override" ? listing.turnaroundHours : inheritedHours;
}

export function readyInLine(hours: number | null): string {
  if (hours == null || hours <= 0) return "Ready-in not set";
  if (hours < 48) return `Ready in ${hours} hours`;
  if (hours % 24 === 0) return `Ready in ${hours / 24} days`;
  return `Ready in ${hours} hours`;
}

/** The formats this listing actually accepts, override or inherited. */
export function effectiveFormatCodes(
  listing: Listing,
  inheritedCodes: string[],
): string[] {
  return listing.fileFormatMode === "override" ? listing.formatCodes : inheritedCodes;
}

/* --------------------------------------------------------------------------
   What is stopping it going on the board
   -------------------------------------------------------------------------- */

export type BoardContext = {
  /** The service line's own turnaround, used when this listing inherits it. */
  inheritedTurnaroundHours: number | null;
  /** The service line's own accepted formats, used when this listing inherits. */
  inheritedFormatCodes: string[];
  /**
   * Whether the accredited line is live. False demotes Live. Absent or null
   * means we have not loaded the line yet — do not invent a wait.
   */
  serviceLive?: boolean | null;
};

const PHOTO_NEEDED = "Add at least one sample photo before it can go on the board.";
const NAME_NEEDED = "Give this listing a name a client would recognise.";
const PRICE_NEEDED = "Set your price before it can go on the board.";
const KIND_NEEDED = "Choose the kind of work this listing is.";
const PRINTER_CAP_NEEDED = "Set your max printer width in feet before it can go on the board.";
const FORMATS_NEEDED = "Say which artwork files you accept for this listing.";
const SERVICE_NEEDED = "This listing has no accredited category to sit under.";
const SERVICE_NOT_LIVE = "This kind of work is not live yet.";

/** GRIDGO's completeness codes → the sentence a shop reads. */
const GRIDGO_BLOCKER_COPY: Record<string, string> = {
  name: NAME_NEEDED,
  base_price: PRICE_NEEDED,
  subcategory: KIND_NEEDED,
  printer_max_width_feet: PRINTER_CAP_NEEDED,
  accepted_file_formats: FORMATS_NEEDED,
  photo: PHOTO_NEEDED,
  owning_service: SERVICE_NEEDED,
};

function emptyGroupSentence(group: SpecGroup): string {
  return group.kind === "addon"
    ? `Add at least one choice under the add-on “${group.name}”, or remove it.`
    : `Add at least one option under “${group.name}”, or remove that step.`;
}

function presentGridgoCode(code: string, listing: Listing): string {
  if (code.startsWith("option_group:")) {
    const id = code.slice("option_group:".length);
    const group = listing.groups.find((candidate) => candidate.id === id);
    if (group) return emptyGroupSentence(group);
    return "Add at least one option to every step, or remove the empty one.";
  }
  return GRIDGO_BLOCKER_COPY[code] ?? "GRIDGO still needs something on this listing.";
}

/**
 * GRIDGO's own completeness rule, applied to the fields on the phone.
 *
 * Matches `catalogItemBlockers` in gridgo-api: name, price, subcategory,
 * printer cap for tarpaulins, accepted formats, at least one photo, an active
 * option in every group. Description, measure unit, pack count and hours are
 * not here — those are editor guidance.
 *
 * A photo still `pending_upload` is invisible to this local pass (we only have
 * file ids). When the payload sent `blockers`, `gridgoNeeds` trusts that list.
 */
function localGridgoNeeds(listing: Listing, context: BoardContext): string[] {
  const out: string[] = [];

  if (!listing.photos.length) out.push(PHOTO_NEEDED);
  if (!listing.name.trim()) out.push(NAME_NEEDED);
  if (!Number.isSafeInteger(listing.basePriceMinor) || listing.basePriceMinor < 0) {
    out.push(PRICE_NEEDED);
  }
  if (!listing.subcategoryCode) out.push(KIND_NEEDED);
  if (needsPrinterCap(listing.subcategoryCode) && !isPrinterCapSet(listing.printerMaxWidthFeet)) {
    out.push(PRINTER_CAP_NEEDED);
  }
  const emptyGroup = listing.groups.find(
    (group) => !group.options.filter((option) => option.active).length,
  );
  if (emptyGroup) out.push(emptyGroupSentence(emptyGroup));
  if (!effectiveFormatCodes(listing, context.inheritedFormatCodes).length) {
    out.push(FORMATS_NEEDED);
  }

  return out;
}

/**
 * What GRIDGO still needs, in shop-facing sentences.
 *
 * Prefers the payload's `blockers` when GRIDGO sent them, then unions any
 * local misses so an unsaved draft that cleared the name still gates Put on
 * the board. The wall's chip is this list, never `boardBlockers`.
 */
export function gridgoNeeds(listing: Listing, context: BoardContext): string[] {
  const local = localGridgoNeeds(listing, context);
  if (!Array.isArray(listing.blockers)) return local;
  const fromApi = listing.blockers.map((code) => presentGridgoCode(code, listing));
  const seen = new Set(fromApi);
  return [...fromApi, ...local.filter((line) => !seen.has(line))];
}

/**
 * Extra asks the editor makes that GRIDGO does not require to put a listing
 * on the board. The wall must never consult this list.
 */
export function editorGuidance(listing: Listing, context: BoardContext): string[] {
  const out: string[] = [];

  if (!listing.description.trim()) {
    out.push("Say what this is, so a client knows what they are ordering.");
  }
  if (listing.basePriceMinor === 0) {
    out.push(PRICE_NEEDED);
  }
  if (listing.pricingUnit === "per_package" && (listing.packageQty ?? 0) < 2) {
    out.push("Say how many pieces are in a pack.");
  }
  if (measurementKind(listing.pricingUnit) === "area" || measurementKind(listing.pricingUnit) === "length") {
    if (!listing.measureUnit) {
      out.push("Say what you measure in — feet, inches, metres — so a client can be asked for a size.");
    }
  }
  if ((listing.minimumWidthMilli == null) !== (listing.minimumHeightMilli == null)) {
    out.push("A smallest billable size needs both a width and a height.");
  }
  if (
    listing.turnaroundMode === "override" &&
    (listing.turnaroundHours == null || listing.turnaroundHours <= 0)
  ) {
    out.push("Set how many hours this takes, or use your shop's usual time.");
  } else if (effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours) == null) {
    out.push("Your shop has no usual turnaround yet. Set the hours for this listing.");
  }

  return out;
}

/**
 * The editor's full checklist: GRIDGO's rule plus the extra guidance.
 *
 * Ordered by where a shop would go next. The first GRIDGO miss is what
 * disables Put on the board; the extras are shown, not enforced, on the wall.
 */
export function boardBlockers(listing: Listing, context: BoardContext): string[] {
  const gridgo = localGridgoNeeds(listing, context);
  const extras = editorGuidance(listing, context).filter((line) => !gridgo.includes(line));
  return [...gridgo, ...extras];
}

export function isComplete(listing: Listing, context: BoardContext): boolean {
  return gridgoNeeds(listing, context).length === 0;
}

export const BOARD_STANDING_LABEL = {
  live: "Live",
  hidden: "Hidden",
  not_ready: "Not ready yet",
  waiting_approval: "Waiting for shop approval",
} as const;

export type BoardStandingKind = keyof typeof BOARD_STANDING_LABEL;

export type BoardStanding = {
  kind: BoardStandingKind;
  /** Live / Hidden / Not ready yet / Waiting for shop approval. */
  label: string;
  tone: "success" | "warning" | "neutral" | "info";
  icon: "circle-check" | "triangle-alert" | "square-pen" | "clock";
  /** One line under it, or null when the label says everything. */
  note: string | null;
};

const WAITING_NOTE = "Clients will see it as soon as Operations approves your shop.";

/**
 * Where this listing stands, said once — wall, list, and editor header.
 *
 * GRIDGO's decision, not the phone's editor checklist. A shop that is still
 * with Operations may build and finish a listing; nothing is shown to a client
 * until GRIDGO approves the shop. Saying that here is the difference between a
 * wait a shop understands and a screen that looks broken.
 */
export function boardStanding(
  listing: Listing,
  context: BoardContext,
  shopApproved: boolean,
): BoardStanding {
  const needs = gridgoNeeds(listing, context);

  if (needs.length) {
    return {
      kind: "not_ready",
      label: BOARD_STANDING_LABEL.not_ready,
      tone: "warning",
      icon: "triangle-alert",
      note: needs[0],
    };
  }
  if (!listing.onTheBoard) {
    return {
      kind: "hidden",
      label: BOARD_STANDING_LABEL.hidden,
      tone: "neutral",
      icon: "square-pen",
      note: "Ready to go up. Clients cannot see it while it is hidden.",
    };
  }
  if (!shopApproved) {
    return {
      kind: "waiting_approval",
      label: BOARD_STANDING_LABEL.waiting_approval,
      tone: "info",
      icon: "clock",
      note: WAITING_NOTE,
    };
  }
  if (context.serviceLive === false) {
    return {
      kind: "not_ready",
      label: BOARD_STANDING_LABEL.not_ready,
      tone: "warning",
      icon: "triangle-alert",
      note: SERVICE_NOT_LIVE,
    };
  }
  return {
    kind: "live",
    label: BOARD_STANDING_LABEL.live,
    tone: "success",
    icon: "circle-check",
    note: null,
  };
}

/** The board's own empty line. One place, so it cannot drift. */
export const EMPTY_BOARD_TITLE = "Nothing on the board yet";
export const EMPTY_BOARD_BODY =
  "Add a listing so clients can see what you print.";

/* --------------------------------------------------------------------------
   Where a listing sits in the shop's accreditation
   -------------------------------------------------------------------------- */

/**
 * One accredited category line, as the board needs it.
 *
 * Read from `/me/supplier-services` rather than the older `/supplier-services`
 * the accreditation screens use, because only that projection carries
 * `acceptedFormats` — which is exactly what a listing inherits. A line whose
 * formats this app could not see would push every listing into overriding them.
 */
export type ServiceLine = {
  id: string;
  categoryCode: string;
  state: string;
  turnaroundHours: number | null;
  formatCodes: string[];
};

export function normalizeServiceLines(body: unknown): ServiceLine[] {
  return collection(body, "services", "supplierServices")
    .map((raw): ServiceLine | null => {
      const id = str(pick(raw, "id", "serviceId"));
      const categoryCode = str(pick(raw, "categoryCode", "category_code"));
      if (!id || !categoryCode) return null;
      return {
        id,
        categoryCode,
        state: str(pick(raw, "state")) ?? "draft",
        turnaroundHours:
          num(pick(raw, "turnaroundHours", "standardTurnaroundHours", "turnaround_hours")),
        formatCodes: readFormatCodes(
          pick(raw, "acceptedFormats", "formatCodes", "accepted_formats", "fileFormats"),
        ),
      };
    })
    .filter((line): line is ServiceLine => line != null);
}

/** The accredited category line a listing hangs off, if the shop still has it. */
export function serviceLineFor(
  listing: Pick<Listing, "serviceLineId">,
  services: ServiceLine[],
): ServiceLine | null {
  return services.find((service) => service.id === listing.serviceLineId) ?? null;
}

/**
 * What this listing inherits from its service line.
 *
 * Turnaround and accepted formats live on the accreditation line because they
 * follow a production capability, not a single sample. A listing overrides
 * either one when the exception is real.
 */
export function boardContextFor(
  listing: Pick<Listing, "serviceLineId">,
  services: ServiceLine[],
): BoardContext {
  const line = serviceLineFor(listing, services);
  return {
    inheritedTurnaroundHours: line?.turnaroundHours ?? null,
    inheritedFormatCodes: line?.formatCodes ?? [],
    serviceLive: line ? line.state === "live" : null,
  };
}

/** The kind of work a code names, in the chart's own words. */
export function coverageFor(
  catalog: ServiceCatalog | null,
  subcategoryCode: string,
): CatalogCoverage | null {
  if (!catalog) return null;
  for (const category of catalog.categories) {
    const match = category.covers.find((cover) => cover.code === subcategoryCode);
    if (match) return match;
  }
  return null;
}

export function subcategoryName(
  catalog: ServiceCatalog | null,
  subcategoryCode: string,
): string {
  return coverageFor(catalog, subcategoryCode)?.name ?? subcategoryCode;
}

/** One category a shop may file a listing under, and the work inside it. */
export type BoardTarget = {
  service: ServiceLine;
  category: CatalogCategory;
  covers: CatalogCoverage[];
};

/**
 * Where this shop is allowed to put a listing.
 *
 * Accreditation is by category, so the choice on the create screen is one of
 * the shop's own lines — never the whole GRIDGO chart. A line still with
 * Operations counts: a shop waiting on approval is exactly the shop that should
 * be building its board, and nothing it builds is shown to a client until
 * GRIDGO approves it anyway. A removed line does not, because work can no
 * longer reach it.
 */
export function boardTargets(
  catalog: ServiceCatalog | null,
  services: ServiceLine[],
): BoardTarget[] {
  if (!catalog) return [];
  const out: BoardTarget[] = [];

  for (const service of services) {
    if (!isActiveLine(service)) continue;
    const code = resolveCategoryCode(catalog, service.categoryCode);
    const category = catalog.categories.find((entry) => entry.code === code);
    if (!category || !category.covers.length) continue;
    if (out.some((target) => target.category.code === category.code)) continue;
    out.push({ service, category, covers: category.covers });
  }

  return out;
}

/* --------------------------------------------------------------------------
   What the floor says about the board
   -------------------------------------------------------------------------- */

export type BoardPrompt = {
  kind: "empty" | "incomplete" | "ready";
  title: string;
  body: string;
  actionLabel: string;
};

/**
 * The board, counted aloud: "3 listings", "1 listing", "No listings yet".
 *
 * Written as its own sentence rather than a fragment, because both places that
 * say it follow "Open your board." — and a label that reads "Open your board.
 * no listings yet." is a label somebody wrote without listening to it.
 */
export function boardCountLine(count: number): string {
  if (count === 0) return "No listings yet";
  return count === 1 ? "1 listing" : `${count} listings`;
}

/**
 * Whether the job floor should say anything about the board, and what.
 *
 * Home is the job floor and must stay that. So the board only earns space there
 * while it is empty or unfinished — the two states a shop cannot see from
 * anywhere else and can fix in a minute — and once it is done, it drops to a
 * quiet strip of samples that links across. There is exactly one ranking on
 * Home and it belongs to the work; this is a card at the foot, not a rival.
 */
export function boardPrompt(
  listings: Listing[],
  services: ServiceLine[],
  shopApproved: boolean,
): BoardPrompt {
  if (!listings.length) {
    return {
      kind: "empty",
      title: EMPTY_BOARD_TITLE,
      body: shopApproved
        ? "Clients pick a shop by looking at its work. Put up one listing with a photo, a price and how fast you turn it round."
        : "Operations wants at least one finished listing before they accredit you. Build it now and it goes live with your shop.",
      actionLabel: "Put something on the board",
    };
  }

  const unfinished = listings.filter(
    (listing) => gridgoNeeds(listing, boardContextFor(listing, services)).length > 0,
  );

  if (unfinished.length) {
    return {
      kind: "incomplete",
      title:
        unfinished.length === 1
          ? "One listing is not finished"
          : `${unfinished.length} listings are not finished`,
      body: `${unfinished[0].name || "A listing"} still needs something before clients can see it. ${
        gridgoNeeds(unfinished[0], boardContextFor(unfinished[0], services))[0]
      }`,
      actionLabel: "Finish your board",
    };
  }

  return {
    kind: "ready",
    title: "Your board",
    body: "What clients see: listings, prices, samples.",
    actionLabel: "Open your board",
  };
}
