import type { Href } from "expo-router";

/**
 * Whether clients can be matched with this shop, said by GRIDGO.
 *
 * `GET /me/supplier-readiness` (gridgo-api `docs/SUPPLIER_CATALOG_API.md`,
 * gridgoph/gridgo-api#136) answers three different questions, and confusing
 * them is how a shop whose listings were already reaching clients read
 * "Not ready" for days:
 *
 * - **`operational`** — can GRIDGO match a client with this shop right now?
 *   Its `ready` is the only thing allowed to say ready / not ready, and each
 *   `listings[].ready` is that listing's own standing.
 * - **`profileCompletion`** — setup gaps (a shop picture, default artwork on a
 *   service line). Real, worth finishing, and never a blocker: matching does
 *   not require them.
 * - the legacy `readyForApproval` / string `missing[]` — Operations' approval
 *   checklist. Never read here: it is exactly the field that said "Not ready"
 *   about a matchable shop.
 *
 * A deployment that predates #136 answers without `operational`; that is
 * `null` here, and every screen keeps the behaviour it had before.
 */

export type ReadinessStep = {
  /** Stable code, e.g. `photo`. Never shown. */
  code: string;
  /** GRIDGO's own plain-English sentence. Shown as-is. */
  message: string;
  /** Stable app navigation key, e.g. `upload_listing_photo`. Never shown. */
  action: string;
  optionGroupId?: string;
};

export type ListingReadiness = {
  catalogItemId: string;
  ready: boolean;
  missing: ReadinessStep[];
};

export type ServiceSetup = {
  supplierServiceId: string;
  missing: ReadinessStep[];
};

export type Readiness = {
  /** At least one listing passes every shop and listing gate. */
  ready: boolean;
  /** Shop-level steps; includes `no_matchable_listing` when nothing passes. */
  missing: ReadinessStep[];
  listings: ListingReadiness[];
  setup: {
    complete: boolean;
    missing: ReadinessStep[];
    services: ServiceSetup[];
  };
};

/** Gates that belong to the shop, repeated inside every listing's `missing`. */
export const SHOP_GATE_CODES: ReadonlySet<string> = new Set([
  "account_inactive",
  "supplier_profile",
  "shop_name",
  "contact_name",
  "shop_location",
  "shop_closed",
  "supplier_membership",
  "supplier_not_approved",
]);

export const NO_MATCHABLE_LISTING = "no_matchable_listing";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Words a shop reads when GRIDGO sent a code but no sentence. */
const FALLBACK_MESSAGE = "GRIDGO still needs something here.";

function normalizeStep(raw: unknown): ReadinessStep | null {
  // The legacy top-level `missing[]` is strings; only structured entries count.
  if (!isRecord(raw)) return null;
  const code = text(raw.code);
  if (!code) return null;
  const optionGroupId = text(raw.optionGroupId);
  return {
    code,
    message: text(raw.message) || FALLBACK_MESSAGE,
    action: text(raw.action),
    ...(optionGroupId ? { optionGroupId } : {}),
  };
}

function normalizeSteps(raw: unknown): ReadinessStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeStep).filter((step): step is ReadinessStep => step != null);
}

/**
 * GRIDGO's answer, or `null` when this deployment does not send `operational`.
 *
 * `null` is not "not ready": it means the app cannot tell, so callers fall
 * back to what they drew before this endpoint existed.
 */
export function normalizeReadiness(body: unknown): Readiness | null {
  if (!isRecord(body) || !isRecord(body.operational)) return null;
  const operational = body.operational;
  if (typeof operational.ready !== "boolean") return null;

  const listings = Array.isArray(operational.listings)
    ? operational.listings
        .map((raw): ListingReadiness | null => {
          if (!isRecord(raw)) return null;
          const catalogItemId = text(raw.catalogItemId);
          if (!catalogItemId) return null;
          const missing = normalizeSteps(raw.missing);
          return {
            catalogItemId,
            ready: typeof raw.ready === "boolean" ? raw.ready : missing.length === 0,
            missing,
          };
        })
        .filter((entry): entry is ListingReadiness => entry != null)
    : [];

  const profile = isRecord(body.profileCompletion) ? body.profileCompletion : null;
  const setupMissing = normalizeSteps(profile?.missing);
  const services = Array.isArray(profile?.services)
    ? profile.services
        .map((raw): ServiceSetup | null => {
          if (!isRecord(raw)) return null;
          const supplierServiceId = text(raw.supplierServiceId);
          if (!supplierServiceId) return null;
          return { supplierServiceId, missing: normalizeSteps(raw.missing) };
        })
        .filter((entry): entry is ServiceSetup => entry != null)
    : [];

  return {
    ready: operational.ready,
    missing: normalizeSteps(operational.missing),
    listings,
    setup: {
      complete:
        typeof profile?.complete === "boolean"
          ? profile.complete
          : setupMissing.length === 0 && services.every((s) => s.missing.length === 0),
      missing: setupMissing,
      services,
    },
  };
}

/** One listing's standing, if GRIDGO reported it. */
export function listingReadinessFor(
  readiness: Readiness | null | undefined,
  catalogItemId: string,
): ListingReadiness | null {
  return readiness?.listings.find((entry) => entry.catalogItemId === catalogItemId) ?? null;
}

/** A listing's own steps, without the shop gates every listing repeats. */
export function listingOwnSteps(entry: ListingReadiness): ReadinessStep[] {
  return entry.missing.filter((step) => !SHOP_GATE_CODES.has(step.code));
}

/** How many listings clients can be matched with right now. */
export function liveListingCount(readiness: Readiness): number {
  return readiness.listings.filter((entry) => entry.ready).length;
}

function onlyHidden(entry: ListingReadiness): boolean {
  const own = listingOwnSteps(entry);
  return own.length > 0 && own.every((step) => step.code === "item_inactive");
}

/**
 * Listings that are not reaching clients for a reason of their own, the ones
 * with work left first.
 *
 * A listing that is merely hidden goes last: it may be hidden on purpose, so
 * it is offered as a way out rather than as the first thing that is wrong.
 * Listings held only by shop gates are left out — their fix is the shop's.
 */
export function listingsNeedingWork(readiness: Readiness): ListingReadiness[] {
  const pending = readiness.listings.filter(
    (entry) => !entry.ready && listingOwnSteps(entry).length > 0,
  );
  return [
    ...pending.filter((entry) => !onlyHidden(entry)),
    ...pending.filter(onlyHidden),
  ];
}

/* --------------------------------------------------------------------------
   Where each step is fixed
   -------------------------------------------------------------------------- */

export type StepTarget = {
  /** A clear verb: "Add a photo", "Open accreditation". */
  label: string;
  href: Href;
};

const CHAT: StepTarget = { label: "Message Operations", href: "/chat" };
const BOARD: StepTarget = { label: "Open your board", href: "/(tabs)/catalogues" };
const SERVICES: StepTarget = { label: "Open services", href: "/services" };

function listingTarget(label: string, catalogItemId: string | undefined, photos = false): StepTarget {
  if (!catalogItemId) return BOARD;
  return {
    label,
    href: photos
      ? { pathname: "/shop/[id]/photos", params: { id: catalogItemId } }
      : { pathname: "/shop/[id]", params: { id: catalogItemId } },
  };
}

/**
 * The screen that fixes this step, or `null` when nothing on the phone can.
 *
 * Keyed on GRIDGO's `action`, never the message. Actions without a screen in
 * this app yet (the shop picture, pickup payment options, reopening a shop
 * Operations closed) go to Operations, because a step with no way forward is
 * how a shop learns to stop reading the list. Request-only actions (a smaller
 * width, a later deadline) belong to a client's request and get no button.
 * An action this version has never heard of also goes to Operations.
 */
export function stepTarget(
  step: ReadinessStep,
  context: { catalogItemId?: string; listingCount?: number } = {},
): StepTarget | null {
  const { catalogItemId, listingCount } = context;
  switch (step.action) {
    case "contact_operations":
    case "open_shop":
    case "upload_shop_image":
    case "edit_payment_terms":
      return CHAT;
    case "edit_profile":
      return step.code === "shop_location"
        ? { label: "Set your shop pin", href: "/shop-location" }
        : { label: "Edit shop details", href: "/shop-details" };
    case "view_approval":
      return { label: "Open accreditation", href: "/accreditation" };
    case "edit_listings":
      return listingCount === 0 ? { label: "Add a listing", href: "/shop/new" } : BOARD;
    case "edit_listing":
    case "edit_listing_formats":
    case "edit_listing_options":
      return listingTarget("Open this listing", catalogItemId);
    case "activate_listing":
      return listingTarget("Put it on the board", catalogItemId);
    case "upload_listing_photo":
      return listingTarget("Add a photo", catalogItemId, true);
    case "view_service":
    case "edit_services":
    case "edit_service":
    case "edit_service_formats":
      return SERVICES;
    case "review_schedule":
      return { label: "Open capacity", href: "/capacity" };
    case "choose_smaller_width":
    case "choose_later_deadline":
      return null;
    default:
      return CHAT;
  }
}

/**
 * The fix for one listing as a single door: its first own step decides where
 * the button goes, so a listing missing only a photo opens the photo screen.
 */
export function listingFixTarget(entry: ListingReadiness): StepTarget {
  const first = listingOwnSteps(entry)[0];
  if (!first) return listingTarget("Open this listing", entry.catalogItemId);
  const target = stepTarget(first, { catalogItemId: entry.catalogItemId });
  return target ?? listingTarget("Open this listing", entry.catalogItemId);
}

/* --------------------------------------------------------------------------
   Setup gaps
   -------------------------------------------------------------------------- */

export type SetupGap = {
  step: ReadinessStep;
  /** How many service lines share this gap; 0 for a shop-level gap. */
  serviceCount: number;
};

/**
 * "Finish your shop setup", deduplicated.
 *
 * Shop gaps first, then each service gap once with a count — five lines that
 * all lack default artwork are one thing to do, not five. A gap already named
 * as a blocker is left out so the same sentence is not said twice in two
 * tones of voice.
 */
export function setupGaps(readiness: Readiness): SetupGap[] {
  const blocking = new Set(readiness.missing.map((step) => step.code));
  const seen = new Set<string>();
  const out: SetupGap[] = [];

  for (const step of readiness.setup.missing) {
    if (blocking.has(step.code) || seen.has(step.code)) continue;
    seen.add(step.code);
    out.push({ step, serviceCount: 0 });
  }

  const byCode = new Map<string, SetupGap>();
  for (const service of readiness.setup.services) {
    for (const step of service.missing) {
      if (blocking.has(step.code) || seen.has(step.code)) continue;
      const gap = byCode.get(step.code);
      if (gap) gap.serviceCount += 1;
      else byCode.set(step.code, { step, serviceCount: 1 });
    }
  }
  return [...out, ...byCode.values()];
}

/** "2 steps left", "1 step left". */
export function stepsLeftLine(count: number): string {
  return count === 1 ? "1 step left" : `${count} steps left`;
}

function listingsWord(count: number): string {
  return count === 1 ? "1 listing" : `${count} listings`;
}

/**
 * The count beside "Not ready", in the same units as the card under it.
 *
 * When listings need work, "no listing is eligible" is not one step — the card
 * opens it into every listing that needs fixing, so the count names those:
 * "8 listings need work", never "1 step left" over a list of eight. Other shop
 * steps are counted beside them ("1 step and 8 listings left"). With nothing
 * on the listing side, it is the plain step count.
 */
export function notReadyCountLine(readiness: Readiness): string {
  const listings = listingsNeedingWork(readiness).length;
  if (!listings) return stepsLeftLine(readiness.missing.length);
  const steps = readiness.missing.filter((step) => step.code !== NO_MATCHABLE_LISTING).length;
  if (!steps) return listings === 1 ? "1 listing needs work" : `${listings} listings need work`;
  return `${steps === 1 ? "1 step" : `${steps} steps`} and ${listingsWord(listings)} left`;
}
