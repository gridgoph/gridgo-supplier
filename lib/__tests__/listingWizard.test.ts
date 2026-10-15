import { aboutBlocker, artworkBlocker, pickReady, priceReady, productionWindow, speedReady } from "@/lib/listingWizard";
import { sameDay, workingDays } from "@/lib/productionDays";
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
  printLayouts: [],
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundMode: "inherit",
  turnaround: null,
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
    expect(productionWindow(draft, workingDays(2))).toEqual({ min: workingDays(2), max: workingDays(2) });
    expect(productionWindow(draft, null)).toEqual({ min: workingDays(2), max: workingDays(2) });
    expect(
      productionWindow({ ...draft, minimumTurnaround: workingDays(4), turnaround: workingDays(2) }, null),
    ).toEqual({ min: workingDays(2), max: workingDays(2) });
    // A same-day line passes its hours down to a listing that follows it.
    expect(productionWindow(draft, sameDay(90))).toEqual({ min: sameDay(90), max: sameDay(90) });
    expect(speedReady(listing, draft, { inheritedTurnaround: { unit: "days" as const, days: 2 }, inheritedFormatCodes: [] })).toBe(true);
    expect(
      speedReady(
        listing,
        { ...draft, turnaroundMode: "override", minimumTurnaround: sameDay(60), turnaround: workingDays(3) },
        { inheritedTurnaround: { unit: "days" as const, days: 2 }, inheritedFormatCodes: [] },
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
    expect(artworkBlocker(listing, draft, { inheritedTurnaround: { unit: "days" as const, days: 2 }, inheritedFormatCodes: ["pdf"] })).toContain(
      "artwork",
    );
    expect(
      artworkBlocker(
        listing,
        { ...draft, formatCodes: ["pdf"] },
        { inheritedTurnaround: { unit: "days" as const, days: 2 }, inheritedFormatCodes: ["pdf"] },
      ),
    ).toBeNull();
  });
});
