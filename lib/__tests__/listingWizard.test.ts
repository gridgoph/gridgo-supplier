import { aboutBlocker, artworkBlocker, pickReady, priceReady, productionHours, speedReady } from "@/lib/listingWizard";
import { draftFrom } from "@/lib/listingDraft";
import type { Listing } from "@/lib/listings";

const listing: Listing = {
  id: "item_1",
  serviceLineId: "svc_1",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: "",
  basePriceMinor: 0,
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
  turnaroundHours: null,
  fileFormatMode: "inherit",
  formatCodes: [],
  onTheBoard: false,
  sortOrder: 0,
  photos: [],
  groups: [],
  version: 1,
  updatedAt: null,
};

describe("wizard gates", () => {
  it("requires a category, a kind of work, and a tarp printer cap", () => {
    expect(pickReady({ categoryCode: null, subcategoryCode: null, printerMaxWidthFeet: null })).toBe(false);
    expect(pickReady({ categoryCode: "marketing_promotional", subcategoryCode: "flyers", printerMaxWidthFeet: null })).toBe(true);
    expect(
      pickReady({
        categoryCode: "marketing_promotional",
        subcategoryCode: "tarpaulins_outdoor_banners",
        printerMaxWidthFeet: null,
      }),
    ).toBe(false);
    expect(
      pickReady({
        categoryCode: "marketing_promotional",
        subcategoryCode: "tarpaulins_outdoor_banners",
        printerMaxWidthFeet: 5,
      }),
    ).toBe(true);
  });

  it("names a missing sample before a missing name", () => {
    expect(aboutBlocker(listing, "")).toContain("sample photo");
    expect(
      aboutBlocker({ ...listing, photos: [{ fileId: "f1", sortOrder: 0, altText: null }] }, ""),
    ).toContain("name");
    expect(
      aboutBlocker({ ...listing, photos: [{ fileId: "f1", sortOrder: 0, altText: null }] }, "Flyers"),
    ).toBeNull();
  });

  it("treats a production window as ready when the soonest is not after the latest", () => {
    const draft = draftFrom(listing);
    expect(productionHours(draft, 48)).toEqual({ min: 48, max: 48 });
    expect(speedReady(listing, draft, { inheritedTurnaroundHours: 48, inheritedFormatCodes: [] })).toBe(true);
    expect(
      speedReady(
        listing,
        { ...draft, turnaroundMode: "override", minimumTurnaroundHours: 24, turnaroundHours: 72 },
        { inheritedTurnaroundHours: 48, inheritedFormatCodes: [] },
      ),
    ).toBe(true);
  });

  it("accepts a typed price GRIDGO will take", () => {
    expect(priceReady("")).toBe(false);
    expect(priceReady("0")).toBe(false);
    expect(priceReady("450")).toBe(true);
  });

  it("requires a format when the listing overrides artwork", () => {
    const draft = { ...draftFrom(listing), fileFormatMode: "override" as const, formatCodes: [] };
    expect(artworkBlocker(listing, draft, { inheritedTurnaroundHours: 48, inheritedFormatCodes: ["pdf"] })).toContain(
      "artwork",
    );
    expect(
      artworkBlocker(
        listing,
        { ...draft, formatCodes: ["pdf"] },
        { inheritedTurnaroundHours: 48, inheritedFormatCodes: ["pdf"] },
      ),
    ).toBeNull();
  });
});
