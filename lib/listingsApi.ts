import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { fileFormatName } from "@/data/fileFormats";
import {
  LISTING_CAPS,
  nextFreeSlot,
  normalizeListing,
  normalizeListings,
  normalizePrepSteps,
  normalizeStarters,
  type Listing,
  type ListingStarter,
  type PrepStep,
  type SpecGroup,
} from "@/lib/listings";

/**
 * The board, against a GRIDGO that may not have every part of it yet.
 *
 * `docs/SUPPLIER_CATALOG_API.md` in gridgo-api is the contract. Two rules run
 * through everything here.
 *
 * **A version goes with every change.** GRIDGO answers
 * `400 expected_version_required` otherwise, and which record's version depends
 * on what is moving: the listing's for its own fields, its formats, its photos
 * and for opening a new step; the *step's* for renaming it, removing it, and
 * for every option inside it. `lib/api.ts` sends each one as both
 * `expectedVersion` and `If-Match`.
 *
 * **A route that is not there yet is a third outcome, not a failure.** These
 * routes are the newest thing on GRIDGO and a deployment can be behind the
 * contract, so a 404 says so plainly and offers to look again — a shop cannot
 * fix GRIDGO's release schedule, and a red error would tell it to try. Nothing
 * here keeps a local copy of anything: a board that exists on one phone is
 * worse than an empty one, because a shop would fill it and find out at the
 * first job that no client could see it.
 */

export type BoardOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** What a shop is told while GRIDGO has no board routes. Promises nothing. */
export const BOARD_NOT_OPEN_YET =
  "GRIDGO has not opened your board on this app yet. Nothing you do here is lost — check again shortly, and it will be the first thing this screen shows.";

/** The same fact for the one section the platform is still building. */
export const PREP_STEPS_NOT_OPEN_YET =
  "GRIDGO has not opened this section yet. Your listing is unaffected — check again shortly and add what a client should do before they send work.";

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

/**
 * A listing GRIDGO answered with but this app could not read.
 *
 * Kept apart from every other outcome on purpose. It is not "your board is not
 * open" — the board is open, GRIDGO returned a listing, and this app is the
 * part that is behind. Saying so is what stops a shop pulling back and forth on
 * a screen that will never load.
 */
const UNREADABLE_LISTING =
  "GRIDGO sent this listing in a shape this version of the app cannot read. Update GRIDGO Supplier, or ask Operations to open it on the web.";

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
  let body: unknown;
  try {
    body = await api.getCatalogItem(itemId);
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("open this listing")),
    };
  }

  // GRIDGO answered. Whatever happens now, this is not "the board is closed" —
  // turning a parse miss into a synthetic 404 is how a working listing ends up
  // reported as a platform that has not shipped.
  const listing = normalizeListing(body);
  return listing ? { status: "ok", value: listing } : { status: "failed", message: UNREADABLE_LISTING };
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
    if (!listing) throw new api.ApiError(502, { error: "unreadable" });
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
    const saved = normalizeListing(
      await api.updateCatalogItem(listing.id, listing.version, patch),
    );
    if (!saved) throw new api.ApiError(502, { error: "unreadable" });
    return saved;
  });
}

/**
 * What happened to a listing the shop asked to remove.
 *
 * GRIDGO archives a listing a client has already ordered from, so the job's
 * history keeps the price and options it was sold at. That is a different fact
 * from "it is gone", and a shop that is told the wrong one goes looking for a
 * listing that is no longer on its board.
 */
export type RemovalOutcome = "deleted" | "archived";

export const ARCHIVED_SENTENCE =
  "Kept for a job already ordered — it is off the board and no client can see it.";

export async function removeListing(
  listing: Listing,
): Promise<BoardOutcome<RemovalOutcome>> {
  return attempt("remove this listing", async () => {
    const body = await api.deleteCatalogItem(listing.id, listing.version);
    // An archived listing comes back as the item itself, still there and no
    // longer active. A deleted one comes back with nothing to return.
    const kept = normalizeListing(body);
    return kept ? "archived" : "deleted";
  });
}

/* --------------------------------------------------------------------------
   Files a listing accepts
   -------------------------------------------------------------------------- */

/**
 * Replace the listing's own accepted-format set.
 *
 * `inherit` clears the listing's rows and follows its category line; `override`
 * needs at least one code. A code the platform has not seeded yet comes back as
 * a refusal naming that code, and it is named on screen too — the link formats
 * are landing on GRIDGO in parallel with this screen, and "one of your choices
 * is not accepted" would leave a shop unticking five boxes to find out which.
 */
export async function setFileFormats(
  listing: Listing,
  mode: Listing["fileFormatMode"],
  formatCodes: string[],
): Promise<BoardOutcome<Listing>> {
  try {
    const saved = normalizeListing(
      await api.putCatalogItemFileFormats(
        listing.id,
        listing.version,
        mode,
        mode === "override" ? formatCodes : [],
      ),
    );
    if (!saved) return { status: "failed", message: UNREADABLE_LISTING };
    return { status: "ok", value: saved };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    const refused = refusedFormatCode(error);
    if (refused) {
      return {
        status: "failed",
        message: `GRIDGO does not accept ${fileFormatName(refused)} yet. Take it off and save the rest — it will appear here when the platform opens it.`,
      };
    }
    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("save the files you accept")),
    };
  }
}

/** The one code GRIDGO named when it refused the set, if it named one. */
function refusedFormatCode(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  if (typeof body !== "object" || !body) return null;
  const record = body as Record<string, unknown>;
  if (record.error !== "invalid_file_format") return null;
  return typeof record.formatCode === "string" ? record.formatCode : null;
}

/* --------------------------------------------------------------------------
   Steps and add-ons
   -------------------------------------------------------------------------- */

/**
 * Open a step or an add-on, with the first thing a client can pick.
 *
 * GRIDGO will not create an empty group, and it is right not to: a step with
 * nothing under it is a question a client cannot answer. So the screen asks for
 * the name and the first choice together, and both go in one call.
 */
export async function addGroup(
  listing: Listing,
  input: {
    name: string;
    kind: "spec" | "addon";
    required: boolean;
    helpText?: string | null;
    firstOption: { label: string; priceModifierMinor: number };
  },
): Promise<BoardOutcome<null>> {
  return attempt(input.kind === "addon" ? "add this add-on" : "add this step", async () => {
    await api.createCatalogOptionGroup(listing.id, listing.version, {
      name: input.name,
      kind: input.kind,
      // Only a step can be required; an extra a client may skip cannot be.
      required: input.kind === "addon" ? false : input.required,
      helpText: input.helpText ?? null,
      sortOrder: nextFreeSlot(
        listing.groups.map((group) => group.sortOrder),
        LISTING_CAPS.specGroups,
      ),
      options: [
        {
          label: input.firstOption.label,
          priceModifierMinor: input.firstOption.priceModifierMinor,
          sortOrder: 0,
        },
      ],
    });
    return null;
  });
}

export async function saveGroup(
  listing: Listing,
  group: SpecGroup,
  patch: { name?: string; required?: boolean; helpText?: string | null; sortOrder?: number },
): Promise<BoardOutcome<null>> {
  return attempt("save this step", async () => {
    await api.updateCatalogOptionGroup(listing.id, group.id, group.version, patch);
    return null;
  });
}

export async function removeGroup(
  listing: Listing,
  group: SpecGroup,
): Promise<BoardOutcome<null>> {
  return attempt("remove this step", async () => {
    await api.deleteCatalogOptionGroup(listing.id, group.id, group.version);
    return null;
  });
}

/**
 * Add one thing a client can pick.
 *
 * The position is sent rather than left to GRIDGO. Left out, the contract reads
 * it as zero — which the group's first choice already holds — so the second
 * choice a shop ever adds comes back refused for a position it never chose.
 */
export async function addOption(
  group: SpecGroup,
  input: { label: string; priceModifierMinor: number },
): Promise<BoardOutcome<null>> {
  return attempt("add this choice", async () => {
    await api.createCatalogOption(group.id, group.version, {
      label: input.label,
      priceModifierMinor: input.priceModifierMinor,
      sortOrder: nextFreeSlot(
        group.options.map((option) => option.sortOrder),
        LISTING_CAPS.optionsPerGroup,
      ),
    });
    return null;
  });
}

export async function saveOption(
  group: SpecGroup,
  optionId: string,
  patch: { label?: string; priceModifierMinor?: number; active?: boolean; sortOrder?: number },
): Promise<BoardOutcome<null>> {
  return attempt("save this choice", async () => {
    await api.updateCatalogOption(group.id, optionId, group.version, patch);
    return null;
  });
}

export async function removeOption(
  group: SpecGroup,
  optionId: string,
): Promise<BoardOutcome<null>> {
  return attempt("remove this choice", async () => {
    await api.deleteCatalogOption(group.id, optionId, group.version);
    return null;
  });
}

/* --------------------------------------------------------------------------
   Sample photos
   -------------------------------------------------------------------------- */

/**
 * Set the order of a listing's samples. The first one is the board thumbnail.
 *
 * GRIDGO takes the whole current set and rejects anything else as stale, so
 * this only ever reorders. Removing a sample is not a thing the contract has:
 * an attached file cannot be deleted while it is referenced, and the way a
 * sample is taken down is to put another in its place — see {@link replacePhoto}.
 */
export async function setPhotoOrder(
  listing: Listing,
  fileIds: string[],
): Promise<BoardOutcome<null>> {
  return attempt("reorder your sample photos", async () => {
    await api.reorderCatalogItemPhotos(listing.id, listing.version, fileIds);
    return null;
  });
}

/**
 * Put one stored upload on the listing.
 *
 * Attaching at a position a sample already holds replaces it. Only a file id
 * GRIDGO has confirmed it stored may be sent.
 */
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
   Before they order
   -------------------------------------------------------------------------- */

export async function loadPrepSteps(itemId: string): Promise<BoardOutcome<PrepStep[]>> {
  return attempt("load what a client should do first", async () =>
    normalizePrepSteps(await api.listPrepSteps(itemId)),
  );
}

/**
 * Add one instruction, at the end of what is already there.
 *
 * The position is worked out from the steps on screen rather than left to
 * GRIDGO, for the same reason a choice's is: after a shop removes the first of
 * three, the count is a position something already holds.
 */
export async function addPrepStep(
  listing: Listing,
  steps: readonly PrepStep[],
  input: { title: string; body: string },
): Promise<BoardOutcome<null>> {
  return attempt("add this step", async () => {
    await api.createPrepStep(listing.id, listing.version, {
      ...input,
      sortOrder: nextFreeSlot(
        steps.map((step) => step.sortOrder),
        LISTING_CAPS.prepSteps,
      ),
    });
    return null;
  });
}

/**
 * Move one step up or down the list.
 *
 * The whole set goes to GRIDGO in the order a client should read it. Nothing
 * moves by rewriting one position: two steps swapping would both want the
 * position they are passing through, and GRIDGO would refuse the second.
 */
export async function reorderPrepSteps(
  listing: Listing,
  steps: readonly PrepStep[],
): Promise<BoardOutcome<null>> {
  return attempt("reorder these steps", async () => {
    await api.reorderPrepSteps(
      listing.id,
      listing.version,
      steps.map((step) => step.id),
    );
    return null;
  });
}

export async function removePrepStep(
  listing: Listing,
  stepId: string,
): Promise<BoardOutcome<null>> {
  return attempt("remove this step", async () => {
    await api.deletePrepStep(listing.id, stepId, listing.version);
    return null;
  });
}

/* --------------------------------------------------------------------------
   Starters
   -------------------------------------------------------------------------- */

/**
 * GRIDGO's own starting points for one kind of work.
 *
 * An empty list is a real answer: that kind of work has no starter, and the
 * shop starts blank. A missing route is `not_open_yet`. A failed load is a
 * sentence the pick screen can retry — swallowing it used to hide starters
 * behind a blank-only list.
 */
export async function loadStarters(
  subcategoryCode: string,
): Promise<BoardOutcome<ListingStarter[]>> {
  return attempt("load GRIDGO starters", async () =>
    normalizeStarters(await api.listListingStarters(subcategoryCode)),
  );
}
