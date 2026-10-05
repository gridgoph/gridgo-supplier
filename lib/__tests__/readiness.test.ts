import {
  boardContextFor,
  boardStanding,
  normalizeListing,
  type Listing,
} from "@/lib/listings";
import {
  listingFixTarget,
  listingReadinessFor,
  listingsNeedingWork,
  liveListingCount,
  normalizeReadiness,
  notReadyCountLine,
  setupGaps,
  stepTarget,
  type ReadinessStep,
} from "@/lib/readiness";

/**
 * Responses shaped like gridgo-api#136's `GET /me/supplier-readiness`.
 * The step sentences are GRIDGO's own; the app shows them as sent.
 */
const step = (code: string, message: string, action: string): ReadinessStep => ({
  code,
  message,
  action,
});

const PHOTO = step("photo", "Attach at least one fully uploaded listing photo.", "upload_listing_photo");
const HIDDEN = step(
  "item_inactive",
  "This listing is hidden. Make it active to offer it to clients.",
  "activate_listing",
);
const APPROVAL = step(
  "supplier_not_approved",
  "Your shop needs Operations approval before clients can match with it.",
  "view_approval",
);
const CLOSED = step("shop_closed", "Your shop is marked closed for new work.", "open_shop");
const NO_LISTING = step(
  "no_matchable_listing",
  "No listing is eligible for matching. Complete the steps listed for your listings, or add a listing.",
  "edit_listings",
);
const SHOP_IMAGE = step(
  "shop_identity_image",
  "Upload a shop identity image to complete your shop setup.",
  "upload_shop_image",
);
const SERVICE_FORMATS = step(
  "service_default_formats",
  "Choose default artwork formats for this service line to complete setup. Listings may use their own formats for matching.",
  "edit_service_formats",
);

/** A ready shop: one listing matches, setup finished. */
const READY_SHOP = {
  readyForApproval: true,
  missing: [],
  publishableServiceIds: ["svc_1"],
  operational: {
    ready: true,
    missing: [],
    listings: [
      { catalogItemId: "item_live", ready: true, missing: [] },
      { catalogItemId: "item_hidden", ready: false, missing: [HIDDEN] },
    ],
  },
  profileCompletion: { complete: true, missing: [], services: [] },
  requestEligibility: { evaluated: false, input: null, listings: [] },
};

/**
 * The reported bug: the legacy checklist fails (shop picture, service default
 * formats) while the shop's listings already match.
 */
const READY_WITH_SETUP_GAPS = {
  readyForApproval: false,
  missing: ["review_ready_service_line", "shop_identity_image"],
  publishableServiceIds: [],
  operational: {
    ready: true,
    missing: [],
    listings: [{ catalogItemId: "item_live", ready: true, missing: [] }],
  },
  profileCompletion: {
    complete: false,
    missing: [SHOP_IMAGE],
    services: [
      { supplierServiceId: "svc_1", missing: [SERVICE_FORMATS] },
      { supplierServiceId: "svc_2", missing: [SERVICE_FORMATS] },
    ],
  },
  requestEligibility: { evaluated: false, input: null, listings: [] },
};

/** Not ready, several steps: closed, not approved, no listing passes. */
const NOT_READY_SHOP = {
  readyForApproval: false,
  missing: ["complete_catalog_item"],
  publishableServiceIds: [],
  operational: {
    ready: false,
    missing: [CLOSED, APPROVAL, NO_LISTING],
    listings: [
      { catalogItemId: "item_hidden", ready: false, missing: [HIDDEN, CLOSED, APPROVAL] },
      { catalogItemId: "item_photo", ready: false, missing: [PHOTO, HIDDEN, CLOSED, APPROVAL] },
    ],
  },
  profileCompletion: { complete: false, missing: [CLOSED, SHOP_IMAGE], services: [] },
};

/** An API from before #136: the legacy checklist only. */
const OLD_SHAPE = {
  readyForApproval: false,
  missing: ["review_ready_service_line", "shop_identity_image"],
  publishableServiceIds: [],
};

function listing(id: string, overrides: Record<string, unknown> = {}): Listing {
  const value = normalizeListing({
    id,
    name: "Tarpaulin 3×6",
    subcategoryCode: "flyers",
    basePriceMinor: 30000,
    active: true,
    photos: [{ fileId: "f1" }],
    fileFormatMode: "override",
    acceptedFormats: ["pdf"],
    ...overrides,
  });
  if (!value) throw new Error("fixture did not normalise");
  return value;
}

describe("normalizeReadiness", () => {
  it("reads a ready shop from operational.ready", () => {
    const readiness = normalizeReadiness(READY_SHOP);
    expect(readiness?.ready).toBe(true);
    expect(readiness && liveListingCount(readiness)).toBe(1);
    expect(readiness?.setup.complete).toBe(true);
  });

  it("calls a matchable shop ready even when the approval checklist and setup fail", () => {
    const readiness = normalizeReadiness(READY_WITH_SETUP_GAPS);
    expect(readiness?.ready).toBe(true);
    expect(readiness?.missing).toEqual([]);
    expect(readiness?.setup.complete).toBe(false);
  });

  it("keeps every structured step of a not-ready shop, in GRIDGO's order and words", () => {
    const readiness = normalizeReadiness(NOT_READY_SHOP);
    expect(readiness?.ready).toBe(false);
    expect(readiness?.missing.map((s) => s.code)).toEqual([
      "shop_closed",
      "supplier_not_approved",
      "no_matchable_listing",
    ]);
    expect(readiness?.missing[1].message).toBe(APPROVAL.message);
  });

  it("returns null for an API without operational, so screens fall back", () => {
    expect(normalizeReadiness(OLD_SHAPE)).toBeNull();
    expect(normalizeReadiness(null)).toBeNull();
    expect(normalizeReadiness({ operational: { missing: [] } })).toBeNull();
  });

  it("drops malformed steps instead of crashing, and fills a missing sentence", () => {
    const readiness = normalizeReadiness({
      operational: {
        ready: false,
        missing: ["legacy_string", null, { code: "brand_new_code", action: "brand_new_action" }],
        listings: [{ ready: true }, { catalogItemId: "x", missing: "nope" }],
      },
    });
    expect(readiness?.missing).toEqual([
      { code: "brand_new_code", message: "GRIDGO still needs something here.", action: "brand_new_action" },
    ]);
    expect(readiness?.listings).toEqual([{ catalogItemId: "x", ready: true, missing: [] }]);
  });
});

describe("stepTarget", () => {
  it("takes each action to the screen that fixes it", () => {
    expect(stepTarget(APPROVAL)?.href).toBe("/accreditation");
    expect(stepTarget(PHOTO, { catalogItemId: "item_photo" })?.href).toEqual({
      pathname: "/shop/[id]/photos",
      params: { id: "item_photo" },
    });
    expect(stepTarget(HIDDEN, { catalogItemId: "item_hidden" })?.href).toEqual({
      pathname: "/shop/[id]",
      params: { id: "item_hidden" },
    });
    expect(stepTarget(SERVICE_FORMATS)?.href).toBe("/services");
    expect(
      stepTarget(step("shop_location", "Set your shop pickup location.", "edit_profile"))?.href,
    ).toBe("/shop-location");
    expect(stepTarget(step("shop_name", "Add your shop name.", "edit_profile"))?.href).toBe(
      "/shop-details",
    );
  });

  it("offers Add a listing for an empty board and the board otherwise", () => {
    expect(stepTarget(NO_LISTING, { listingCount: 0 })?.href).toBe("/shop/new");
    expect(stepTarget(NO_LISTING, { listingCount: 4 })?.href).toBe("/(tabs)/catalogues");
  });

  it("sends steps with no screen in this app, and unknown actions, to Operations", () => {
    expect(stepTarget(CLOSED)?.href).toBe("/chat");
    expect(stepTarget(SHOP_IMAGE)?.href).toBe("/chat");
    expect(stepTarget(step("future", "Something new.", "future_action"))?.label).toBe(
      "Message Operations",
    );
  });

  it("offers no button for a request-only step", () => {
    expect(stepTarget(step("deadline_not_met", "…", "choose_later_deadline"))).toBeNull();
  });
});

describe("listings in a not-ready shop", () => {
  it("lists listings with work first and merely hidden ones last", () => {
    const readiness = normalizeReadiness(NOT_READY_SHOP)!;
    expect(listingsNeedingWork(readiness).map((e) => e.catalogItemId)).toEqual([
      "item_photo",
      "item_hidden",
    ]);
  });

  it("opens the photo screen for a listing whose first step is a photo", () => {
    const readiness = normalizeReadiness(NOT_READY_SHOP)!;
    const entry = listingReadinessFor(readiness, "item_photo")!;
    expect(listingFixTarget(entry).label).toBe("Add a photo");
  });
});

describe("notReadyCountLine", () => {
  const notReady = (missing: ReadinessStep[], listings: unknown[]) =>
    normalizeReadiness({ operational: { ready: false, missing, listings } })!;
  const needsPhoto = (id: string) => ({ catalogItemId: id, ready: false, missing: [PHOTO] });

  it("counts the listings, not one board step, when listings need work", () => {
    const readiness = notReady(
      [NO_LISTING],
      ["a", "b", "c", "d", "e", "f", "g", "h"].map(needsPhoto),
    );
    expect(notReadyCountLine(readiness)).toBe("8 listings need work");
    expect(notReadyCountLine(notReady([NO_LISTING], [needsPhoto("a")]))).toBe(
      "1 listing needs work",
    );
  });

  it("counts shop steps beside the listings", () => {
    expect(
      notReadyCountLine(notReady([CLOSED, NO_LISTING], [needsPhoto("a"), needsPhoto("b")])),
    ).toBe("1 step and 2 listings left");
    expect(
      notReadyCountLine(notReady([APPROVAL, CLOSED, NO_LISTING], [needsPhoto("a")])),
    ).toBe("2 steps and 1 listing left");
  });

  it("is the plain step count when no listing has work of its own", () => {
    // No listings yet: the board step is one step, "Add a listing".
    expect(notReadyCountLine(notReady([NO_LISTING], []))).toBe("1 step left");
    // Listings held only by a shop gate: the fix is the shop's.
    expect(
      notReadyCountLine(
        notReady([CLOSED], [{ catalogItemId: "a", ready: false, missing: [CLOSED] }]),
      ),
    ).toBe("1 step left");
  });
});

describe("setupGaps", () => {
  it("groups service gaps with a count and keeps shop gaps first", () => {
    const gaps = setupGaps(normalizeReadiness(READY_WITH_SETUP_GAPS)!);
    expect(gaps.map((g) => [g.step.code, g.serviceCount])).toEqual([
      ["shop_identity_image", 0],
      ["service_default_formats", 2],
    ]);
  });

  it("does not repeat a gap that is already a blocker", () => {
    const gaps = setupGaps(normalizeReadiness(NOT_READY_SHOP)!);
    expect(gaps.map((g) => g.step.code)).toEqual(["shop_identity_image"]);
  });
});

describe("boardStanding with GRIDGO's verdict", () => {
  const services = [
    { id: "svc_1", categoryCode: "c", state: "live", turnaroundHours: 24, formatCodes: [] },
  ];

  it("is Live when GRIDGO matches the listing, whatever the phone's own checks say", () => {
    // No photo on the phone: the local pass alone would say Not ready yet.
    const item = listing("item_live", { photos: [], serviceLineId: "svc_1" });
    const local = boardStanding(item, boardContextFor(item, services), true);
    expect(local.label).toBe("Not ready yet");

    const readiness = normalizeReadiness(READY_WITH_SETUP_GAPS);
    const standing = boardStanding(
      item,
      boardContextFor(item, services),
      true,
      listingReadinessFor(readiness, "item_live"),
    );
    expect(standing.label).toBe("Live");
  });

  it("names the exact step a listing lacks", () => {
    const readiness = normalizeReadiness(NOT_READY_SHOP);
    const item = listing("item_photo");
    const standing = boardStanding(
      item,
      boardContextFor(item, services),
      false,
      listingReadinessFor(readiness, "item_photo"),
    );
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toBe(PHOTO.message);
  });

  it("is Hidden when hiding is the listing's only own step", () => {
    const readiness = normalizeReadiness(READY_SHOP);
    const item = listing("item_hidden", { active: false });
    expect(
      boardStanding(item, boardContextFor(item, services), true, listingReadinessFor(readiness, "item_hidden"))
        .label,
    ).toBe("Hidden by you");
  });

  it("waits on approval when approval is the only thing holding it", () => {
    const entry = { catalogItemId: "a", ready: false, missing: [APPROVAL] };
    const item = listing("a");
    expect(boardStanding(item, boardContextFor(item, services), false, entry).label).toBe(
      "Waiting for shop approval",
    );
  });

  it("names a shop gate the shop can fix before the approval wait", () => {
    const entry = { catalogItemId: "a", ready: false, missing: [CLOSED, APPROVAL] };
    const item = listing("a");
    const standing = boardStanding(item, boardContextFor(item, services), false, entry);
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toBe(CLOSED.message);
  });

  it("falls back to the phone's own reading on an old API", () => {
    const item = listing("a", { serviceLineId: "svc_1" });
    const readiness = normalizeReadiness(OLD_SHAPE);
    expect(
      boardStanding(item, boardContextFor(item, services), true, listingReadinessFor(readiness, "a"))
        .label,
    ).toBe("Live");
  });
});
