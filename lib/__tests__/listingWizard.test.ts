import {
  aboutBlocker,
  artworkBlocker,
  pickReady,
  priceBlocker,
  priceReady,
  speedReady,
  wizardProductionTime,
} from "@/lib/listingWizard";
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

  it("starts the production-time question from GRIDGO's time, the category line's, or 1 to 3 working days", () => {
    const draft = draftFrom(listing);
    const lineTwoDays = { inheritedTurnaround: workingDays(2), inheritedFormatCodes: [] };
    expect(wizardProductionTime(listing, draft, lineTwoDays)).toEqual({ mode: "days", minDays: 2, maxDays: 2 });
    // A same-day line passes its hours down to a listing that follows it.
    expect(wizardProductionTime(listing, draft, { inheritedTurnaround: sameDay(90), inheritedFormatCodes: [] })).toEqual({
      mode: "same_day",
      minutes: 90,
    });
    expect(
      wizardProductionTime(
        { ...listing, productionTime: { mode: "same_day", minutes: 120 } },
        draft,
        lineTwoDays,
      ),
    ).toEqual({ mode: "same_day", minutes: 120 });
    expect(wizardProductionTime(listing, draft, { inheritedTurnaround: null, inheritedFormatCodes: [] })).toEqual({
      mode: "days",
      minDays: 1,
      maxDays: 3,
    });
    // The shop's own answer wins.
    const answered = { ...draft, productionTime: { mode: "days" as const, minDays: 2, maxDays: 4 } };
    expect(wizardProductionTime(listing, answered, lineTwoDays)).toEqual({ mode: "days", minDays: 2, maxDays: 4 });
    expect(speedReady(listing, answered, lineTwoDays)).toBe(true);
    expect(
      speedReady(listing, { ...draft, productionTime: { mode: "days", minDays: 3, maxDays: 2 } }, lineTwoDays),
    ).toBe(false);
  });

  it("keeps an older range that mixes hours and days, and takes exact long hours", () => {
    const noLine = { inheritedTurnaround: null, inheritedFormatCodes: [] };
    const mixed = {
      ...listing,
      productionTime: null,
      turnaroundMode: "override" as const,
      minimumTurnaround: sameDay(120),
      turnaround: workingDays(2),
    };
    // Nothing is made up over it, and the step can still be passed.
    expect(wizardProductionTime(mixed, draftFrom(mixed), noLine)).toBeNull();
    expect(speedReady(mixed, draftFrom(mixed), noLine)).toBe(true);
    // 12 hours on a 10-hour working day is a time GRIDGO takes as it is.
    const long = { ...listing, productionDayMinutes: 600, productionTime: { mode: "same_day" as const, minutes: 720 } };
    expect(speedReady(long, draftFrom(long), noLine)).toBe(true);
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

describe("priceBlocker", () => {
  const perPage = { ...draftFrom(listing), pricingUnit: "per_page" as const, pricedByColour: false, printLayouts: ["fit_to_paper" as const] };

  it("asks a fixed listing for its one price", () => {
    expect(priceBlocker(perPage)).toBe("Set your price before it can go on the board.");
    expect(priceBlocker({ ...perPage, price: "30" })).toBeNull();
  });

  it("asks a colour listing for one priced tier, never its one price", () => {
    const colour = { ...perPage, pricedByColour: true };
    expect(priceBlocker(colour)).toBe("Add at least one paper size with its colour prices.");
    expect(priceBlocker({ ...colour, colour: [{ key: "a", paperSize: "A1", prices: {} }] })).toBe(
      "Price at least one colour tier on one paper size before it can go on the board.",
    );
    expect(priceBlocker({ ...colour, colour: [{ key: "a", paperSize: "A1", prices: { none: "0" } }] })).toBeNull();
  });
});
