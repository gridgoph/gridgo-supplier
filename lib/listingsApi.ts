import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  normalizeListing,
  normalizeListings,
  normalizeStarters,
  type Listing,
  type ListingStarter,
} from "@/lib/listings";

/**
 * The board, against a GRIDGO that may not have it yet.
 *
 * The listing routes are settled design and in flight on the platform. Until
 * they land on a deployment, calling them answers 404 — and a screen that
 * showed a shop a red failure for a route GRIDGO has not opened would be
 * blaming the shop for the platform's schedule. So "not open yet" is a third
 * outcome, exactly as it is for the shop's own pin and papers in
 * `lib/verification.ts`: the screen says plainly what is true, offers to try
 * again, and nothing anywhere pretends a listing was saved.
 *
 * Nothing here keeps a local catalogue. A board that exists only on one phone
 * is worse than an empty one: a shop would fill it, believe clients could see
 * it, and find out at the first job that nobody could.
 */

export type BoardOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** What a shop is told while GRIDGO has no board routes. Promises nothing. */
export const BOARD_NOT_OPEN_YET =
  "GRIDGO has not opened your board on this app yet. Nothing you do here is lost — check again shortly, and it will be the first thing this screen shows.";

/** 404/405 mean the route is not there. Anything else is a real failure. */
function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

/**
 * Run one board call and say honestly which of the three things happened.
 *
 * `subject` completes "Cannot reach GRIDGO to …", so it is a verb phrase.
 */
async function attempt<T>(
  subject: string,
  call: () => Promise<T>,
): Promise<BoardOutcome<T>> {
  try {
    return { status: "ok", value: await call() };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return { status: "failed", message: humanizeApiError(error, offlineMessage(subject)) };
  }
}

/* --------------------------------------------------------------------------
   Listings
   -------------------------------------------------------------------------- */

export async function loadBoard(): Promise<BoardOutcome<Listing[]>> {
  return attempt("load your board", async () =>
    normalizeListings(await api.listCatalogItems()),
  );
}

/** One listing, reloaded from GRIDGO. Never trusted from local state. */
export async function loadListing(itemId: string): Promise<BoardOutcome<Listing>> {
  return attempt("open this listing", async () => {
    const listing = normalizeListing(await api.getCatalogItem(itemId));
    if (!listing) throw new api.ApiError(404, { error: "not_found" });
    return listing;
  });
}

export type NewListingInput = {
  /** The accredited category line it sits under. */
  serviceLineId: string;
  subcategoryCode: string;
  name: string;
  /** Clones a GRIDGO starter's steps and add-ons at create time. */
  starterId?: string | null;
};

export async function createListing(
  input: NewListingInput,
): Promise<BoardOutcome<Listing>> {
  return attempt("open this listing", async () => {
    const body: Record<string, unknown> = {
      supplierServiceId: input.serviceLineId,
      subcategoryCode: input.subcategoryCode,
      name: input.name,
      // A new listing is always hidden. Nothing goes up before a shop says so.
      active: false,
    };
    if (input.starterId) body.starterId = input.starterId;
    const listing = normalizeListing(await api.createCatalogItem(body));
    if (!listing) throw new api.ApiError(502, { error: "not_found" });
    return listing;
  });
}

/** Fields a screen may change on a listing. Named the way the API takes them. */
export type ListingPatch = {
  name?: string;
  description?: string;
  basePriceMinor?: number;
  pricingUnit?: Listing["pricingUnit"];
  packageQty?: number | null;
  turnaroundMode?: Listing["turnaroundMode"];
  turnaroundHours?: number | null;
  subcategoryCode?: string;
  /** The platform's `active`; "on the board" everywhere a shop can see. */
  active?: boolean;
  sortOrder?: number;
};

export async function saveListing(
  listing: Listing,
  patch: ListingPatch,
): Promise<BoardOutcome<Listing>> {
  return attempt("save this listing", async () => {
    const body: Record<string, unknown> = { ...patch };
    if (listing.version != null) body.expectedVersion = listing.version;
    const saved = normalizeListing(await api.updateCatalogItem(listing.id, body));
    if (!saved) throw new api.ApiError(502, { error: "not_found" });
    return saved;
  });
}

export async function removeListing(itemId: string): Promise<BoardOutcome<null>> {
  return attempt("remove this listing", async () => {
    await api.deleteCatalogItem(itemId);
    return null;
  });
}

/* --------------------------------------------------------------------------
   Files a listing accepts
   -------------------------------------------------------------------------- */

/**
 * Replace the listing's own accepted-format set.
 *
 * An empty set is how a listing goes back to inheriting its service line's
 * formats — the contract's `inherit` mode holds no item rows.
 */
export async function setFileFormats(
  itemId: string,
  formatCodes: string[],
): Promise<BoardOutcome<null>> {
  return attempt("save the files you accept", async () => {
    await api.putCatalogItemFileFormats(itemId, formatCodes);
    return null;
  });
}

/* --------------------------------------------------------------------------
   Steps and add-ons
   -------------------------------------------------------------------------- */

export async function addGroup(
  itemId: string,
  input: { name: string; kind: "spec" | "addon"; required: boolean; helpText?: string | null },
): Promise<BoardOutcome<null>> {
  return attempt("add this step", async () => {
    await api.createCatalogOptionGroup(itemId, {
      name: input.name,
      kind: input.kind,
      // Only a step can be required; an extra the customer may skip cannot be.
      required: input.kind === "addon" ? false : input.required,
      helpText: input.helpText ?? null,
    });
    return null;
  });
}

export async function renameGroup(
  itemId: string,
  groupId: string,
  patch: { name?: string; required?: boolean; helpText?: string | null; sortOrder?: number },
): Promise<BoardOutcome<null>> {
  return attempt("save this step", async () => {
    await api.updateCatalogOptionGroup(itemId, groupId, patch);
    return null;
  });
}

export async function removeGroup(
  itemId: string,
  groupId: string,
): Promise<BoardOutcome<null>> {
  return attempt("remove this step", async () => {
    await api.deleteCatalogOptionGroup(itemId, groupId);
    return null;
  });
}

export async function addOption(
  groupId: string,
  input: { label: string; priceModifierMinor: number },
): Promise<BoardOutcome<null>> {
  return attempt("add this option", async () => {
    await api.createCatalogOption(groupId, {
      label: input.label,
      priceModifierMinor: input.priceModifierMinor,
    });
    return null;
  });
}

export async function saveOption(
  groupId: string,
  optionId: string,
  patch: { label?: string; priceModifierMinor?: number; active?: boolean; sortOrder?: number },
): Promise<BoardOutcome<null>> {
  return attempt("save this option", async () => {
    await api.updateCatalogOption(groupId, optionId, patch);
    return null;
  });
}

export async function removeOption(
  groupId: string,
  optionId: string,
): Promise<BoardOutcome<null>> {
  return attempt("remove this option", async () => {
    await api.deleteCatalogOption(groupId, optionId);
    return null;
  });
}

/* --------------------------------------------------------------------------
   Sample photos
   -------------------------------------------------------------------------- */

/**
 * Set the order of a listing's samples. The first one is the board thumbnail.
 *
 * This is also how a sample comes off a listing — see the note on
 * `api.reorderCatalogItemPhotos`. Callers reload the listing afterwards, so
 * what the screen shows is what GRIDGO kept, not what this phone hoped.
 */
export async function setPhotoOrder(
  itemId: string,
  fileIds: string[],
): Promise<BoardOutcome<null>> {
  return attempt("save your sample photos", async () => {
    await api.reorderCatalogItemPhotos(itemId, fileIds);
    return null;
  });
}

/** Bind one stored upload to this listing. Only a stored file id may be sent. */
export async function attachPhoto(
  fileId: string,
  itemId: string,
  sortOrder: number,
): Promise<BoardOutcome<null>> {
  return attempt("file this photo with GRIDGO", async () => {
    await api.attachCatalogItemPhoto(fileId, itemId, sortOrder);
    return null;
  });
}

/* --------------------------------------------------------------------------
   Starters
   -------------------------------------------------------------------------- */

/**
 * GRIDGO's own starting points for one kind of work.
 *
 * A deployment without them is not a failure worth showing: the shop simply
 * starts blank, which is a supported choice on that screen anyway. So this
 * answers an empty list rather than an outcome the screen has to branch on.
 */
export async function loadStarters(subcategoryCode: string): Promise<ListingStarter[]> {
  try {
    return normalizeStarters(await api.listListingStarters(subcategoryCode));
  } catch {
    return [];
  }
}
