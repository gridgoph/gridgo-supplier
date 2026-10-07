import {
  listingAlertHref,
  listingFoot,
  presentListingAlert,
  previewLine,
  standingSince,
} from "@/lib/listingReview";
import { boardStanding, SPECS_NEEDED, type Listing } from "@/lib/listings";

const CONTEXT = { inheritedTurnaroundDays: 1, inheritedFormatCodes: ["pdf"] };

const LISTING: Listing = {
  id: "item_1",
  serviceLineId: "svc_1",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: "A5 flyers",
  basePriceMinor: 40000,
  pricingUnit: "per_unit",
  packageQty: null,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  printerMaxWidthFeet: null,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundMode: "inherit",
  turnaroundDays: null,
  fileFormatMode: "inherit",
  formatCodes: [],
  onTheBoard: false,
  sortOrder: 0,
  photos: [{ fileId: "file_1", sortOrder: 0, altText: null, downloadUrl: null, downloadUrlExpiresAt: null }],
  groups: [
    {
      id: "grp_1",
      name: "Size",
      kind: "spec",
      required: true,
      helpText: null,
      sortOrder: 0,
      version: 1,
      options: [
        { id: "opt_1", label: "A5", priceModifierMinor: 0, priceMultiplierBps: null, active: true, sortOrder: 0 },
      ],
    },
  ],
  version: 2,
  updatedAt: null,
  reviewStatus: "pending",
  reviewReason: null,
  reviewedAt: null,
  hasApprovedVersion: false,
};

describe("what the listing editor offers at its foot", () => {
  it("offers Submit for review on a finished new listing the shop has not sent", () => {
    expect(listingFoot(LISTING, CONTEXT)).toEqual({
      kind: "submit",
      blocker: null,
      firstApproval: true,
      onTheBoard: false,
    });
  });

  it("names the first missing thing instead of submitting an unfinished listing", () => {
    const foot = listingFoot({ ...LISTING, groups: [] }, CONTEXT);
    expect(foot).toEqual(expect.objectContaining({ kind: "submit", blocker: SPECS_NEEDED }));
  });

  it("only saves once the new listing is with Operations", () => {
    expect(listingFoot({ ...LISTING, onTheBoard: true }, CONTEXT)).toEqual({ kind: "in_review" });
  });

  it("asks a sent-back listing to be submitted again", () => {
    expect(
      listingFoot({ ...LISTING, onTheBoard: true, reviewStatus: "needs_revision" }, CONTEXT).kind,
    ).toBe("submit");
    expect(
      listingFoot(
        { ...LISTING, onTheBoard: true, hasApprovedVersion: true, reviewStatus: "needs_revision" },
        CONTEXT,
      ),
    ).toEqual(expect.objectContaining({ kind: "submit", firstApproval: false, onTheBoard: true }));
  });

  it("keeps the ordinary switch on an approved listing, pending edits or not", () => {
    const approved = { ...LISTING, hasApprovedVersion: true, reviewStatus: "approved" as const };
    expect(listingFoot({ ...approved, onTheBoard: true }, CONTEXT)).toEqual({ kind: "on_board" });
    expect(listingFoot(approved, CONTEXT)).toEqual({ kind: "hidden" });
    expect(listingFoot({ ...approved, onTheBoard: true, reviewStatus: "pending" }, CONTEXT)).toEqual({
      kind: "on_board",
    });
  });

  it("offers no switch at all while GRIDGO has it taken down", () => {
    expect(listingFoot({ ...LISTING, suspendReason: "Logo on the sample" }, CONTEXT)).toEqual({
      kind: "taken_down",
    });
  });

  it("hands a restored listing back hidden, for the shop to put up again", () => {
    const restored = {
      ...LISTING,
      hasApprovedVersion: true,
      reviewStatus: "approved" as const,
      suspendReason: null,
      suspendedAt: null,
    };
    expect(listingFoot(restored, CONTEXT)).toEqual({ kind: "hidden" });
    expect(boardStanding(restored, CONTEXT, true).label).toBe("Hidden by you");
  });

  it("keeps a GRIDGO without review on Put on the board", () => {
    expect(listingFoot({ ...LISTING, reviewStatus: null, hasApprovedVersion: true }, CONTEXT)).toEqual({
      kind: "hidden",
    });
  });
});

describe("the preview's first line", () => {
  it("says a taken-down listing is invisible and why", () => {
    const standing = boardStanding({ ...LISTING, suspendReason: "Logo on the sample." }, CONTEXT, true);
    expect(previewLine(standing)).toBe(
      "Taken down by GRIDGO, so no client can see this. Reason: Logo on the sample.",
    );
  });

  it("says a pending listing is with Operations", () => {
    const standing = boardStanding({ ...LISTING, onTheBoard: true }, CONTEXT, true);
    expect(previewLine(standing)).toContain("Operations is reviewing this");
  });
});

describe("review and take-down alerts", () => {
  it("rewrites a take-down into the board's words with the reason", () => {
    expect(presentListingAlert({ type: "listing_suspended", body: "Logo on the sample" })).toEqual({
      title: "Taken down by GRIDGO",
      body: "Reason: Logo on the sample. Only GRIDGO can put it back on the board.",
    });
  });

  it("says a restored listing stays hidden until the shop puts it back", () => {
    expect(presentListingAlert({ type: "listing_restored", body: "anything" })?.body).toContain(
      "stays hidden until you put it back on the board",
    );
  });

  it("tells a sent-back decision from a plain one", () => {
    expect(
      presentListingAlert({ type: "catalog_review_decided", body: "Open your listing to see its review status." })
        ?.title,
    ).toBe("Review finished");
    expect(presentListingAlert({ type: "catalog_review_decided", body: "Photo has a watermark" })).toEqual({
      title: "Operations asked for changes",
      body: "Reason: Photo has a watermark.",
    });
  });

  it("leaves every other alert alone", () => {
    expect(presentListingAlert({ type: "shop_job_assigned", body: "x" })).toBeNull();
  });

  it("opens the listing a take-down names, and the board for a review notice", () => {
    expect(listingAlertHref({ type: "listing_suspended", catalogItemId: "item_9" })).toEqual({
      pathname: "/shop/[id]",
      params: { id: "item_9" },
    });
    expect(listingAlertHref({ type: "listing_restored", catalogItemId: "item_9" })).toEqual({
      pathname: "/shop/[id]",
      params: { id: "item_9" },
    });
    expect(listingAlertHref({ type: "catalog_review_decided" })).toBe("/(tabs)/catalogues");
    expect(listingAlertHref({ type: "shop_job_assigned" })).toBeNull();
  });
});

describe("when it happened", () => {
  it("dates a take-down, and says nothing without a time", () => {
    expect(standingSince("Taken down", "2026-10-05T13:55:00.000Z")).toMatch(/^Taken down Oct 5, 2026/);
    expect(standingSince("Taken down", null)).toBeNull();
    expect(standingSince("Taken down", "not a date")).toBeNull();
  });
});
