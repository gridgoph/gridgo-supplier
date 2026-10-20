import {
  applyDraft,
  colourHold,
  draftEdits,
  draftFrom,
  heldMixedRange,
  listingSavePatch,
  measureUnitFor,
  packageQtyFor,
  rebaseEdits,
  sameDraft,
  shownProductionTime,
  withEdits,
} from "@/lib/listingDraft";
import type { Listing } from "@/lib/listings";
import { sameDay, workingDays } from "@/lib/productionDays";

const listing: Listing = {
  id: "item_1",
  serviceLineId: "svc_1",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin",
  description: "",
  basePriceMinor: 0,
  pricingUnit: "per_unit",
  packageQty: null,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  printerMaxWidthFeet: 5,
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

describe("listingSavePatch measured units", () => {
  it("sends feet when per_length has no measure unit typed yet", () => {
    const working = { ...draftFrom(listing), pricingUnit: "per_length" as const, price: "15" };
    expect(working.measureUnit).toBeNull();
    expect(listingSavePatch(working, 1500)).toEqual(
      expect.objectContaining({
        pricingUnit: "per_length",
        measureUnit: "ft",
        packageQty: null,
      }),
    );
  });

  it("sends a pack of 100 when per_package has no count yet", () => {
    const working = { ...draftFrom(listing), pricingUnit: "per_package" as const, price: "450" };
    expect(listingSavePatch(working, 45000)).toEqual(
      expect.objectContaining({
        pricingUnit: "per_package",
        packageQty: 100,
        measureUnit: null,
      }),
    );
  });

  it("sends the shop's answer as productionTime, and never the duration fields beside it", () => {
    const days = listingSavePatch(
      { ...draftFrom(listing), productionTime: { mode: "days", minDays: 1, maxDays: 3 } },
      0,
    );
    expect(days.productionTime).toEqual({ mode: "days", minDays: 1, maxDays: 3 });
    const same = listingSavePatch(
      { ...draftFrom(listing), productionTime: { mode: "same_day", minutes: 90 } },
      0,
    );
    expect(same.productionTime).toEqual({ mode: "same_day", hours: 1.5 });
    for (const patch of [days, same]) {
      expect(JSON.stringify(patch)).not.toMatch(/"(minimumT|t)urnaround(Mode|Days|Minutes|Hours)"|"express"/);
    }
  });

  it("leaves the production time alone on a save that did not touch it", () => {
    const patch = listingSavePatch(draftFrom({ ...listing, name: "Renamed" }), 0);
    expect(patch).not.toHaveProperty("productionTime");
    expect(patch).not.toHaveProperty("turnaroundMode");
  });

  it("counts a touched production time as a change, so the foot offers Save", () => {
    const base = draftFrom(listing);
    expect(sameDraft({ ...base, productionTime: { mode: "same_day", minutes: 60 } }, base)).toBe(false);
    expect(sameDraft(base, draftFrom(listing))).toBe(true);
  });

  it("reads the answer as the window the rest of the editor checks", () => {
    const merged = applyDraft(listing, { ...draftFrom(listing), productionTime: { mode: "same_day", minutes: 120 } });
    expect(merged.turnaroundMode).toBe("override");
    expect(merged.turnaround).toEqual(sameDay(120));
    expect(merged.minimumTurnaround).toEqual(sameDay(120));
  });

  it("shows the shop's answer, else GRIDGO's, else one read off an older window", () => {
    const base = draftFrom(listing);
    expect(shownProductionTime(listing, base, null)).toBeNull();
    expect(shownProductionTime(listing, base, workingDays(2))).toEqual({ mode: "days", minDays: 2, maxDays: 2 });
    expect(
      shownProductionTime({ ...listing, productionTime: { mode: "same_day", minutes: 120 } }, base, workingDays(2)),
    ).toEqual({ mode: "same_day", minutes: 120 });
    expect(
      shownProductionTime(
        { ...listing, turnaroundMode: "override", minimumTurnaround: workingDays(2), turnaround: workingDays(4) },
        base,
        null,
      ),
    ).toEqual({ mode: "days", minDays: 2, maxDays: 4 });
    expect(
      shownProductionTime(listing, { productionTime: { mode: "days", minDays: 3, maxDays: 5 } }, workingDays(2)),
    ).toEqual({ mode: "days", minDays: 3, maxDays: 5 });
  });

  it("never turns an older range that mixes hours and days into a different answer", () => {
    const mixed = {
      ...listing,
      productionTime: null,
      turnaroundMode: "override" as const,
      minimumTurnaround: sameDay(120),
      turnaround: workingDays(2),
    };
    // GRIDGO sent null beside the range: no answer is made up for it.
    expect(shownProductionTime(mixed, draftFrom(mixed), null)).toBeNull();
    expect(heldMixedRange(mixed)).toEqual({ min: sameDay(120), max: workingDays(2) });
    // A GRIDGO that predates the question sends no productionTime at all.
    const { productionTime: _absent, ...older } = mixed;
    expect(shownProductionTime(older, draftFrom(older), null)).toEqual({ mode: "days", minDays: 1, maxDays: 2 });
    expect(heldMixedRange(older)).toBeNull();
    // Null with no older range is simply no time yet.
    expect(heldMixedRange({ ...listing, productionTime: null })).toBeNull();
    // The shop's own pick replaces it.
    expect(
      shownProductionTime(mixed, { productionTime: { mode: "same_day", minutes: 180 } }, null),
    ).toEqual({ mode: "same_day", minutes: 180 });
  });

  it("holds only the fields the shop changed, on top of whatever GRIDGO holds now", () => {
    const v7 = { ...listing, version: 7, name: "Flyers", basePriceMinor: 10_000 };
    const edits = draftEdits({ ...draftFrom(v7), name: "Flyers A5" }, draftFrom(v7));
    expect(edits).toEqual({ name: "Flyers A5" });
    expect(draftEdits(draftFrom(v7), draftFrom(v7))).toBeNull();

    // Another device moved the price; the shop's name stays and the new price is taken.
    const v8 = { ...v7, version: 8, basePriceMinor: 20_000 };
    expect(withEdits(v8, edits)).toEqual({ ...draftFrom(v8), name: "Flyers A5" });
    expect(withEdits(v8, edits).price).toBe("200.00");
    expect(rebaseEdits(edits, v8)).toEqual({ name: "Flyers A5" });
    // An edit GRIDGO now holds too is no longer the shop's.
    expect(rebaseEdits(edits, { ...v8, name: "Flyers A5" })).toBeNull();
  });

  it("sends each faster price tier in its own unit, as before", () => {
    const working = {
      ...draftFrom(listing),
      speedTiers: [
        { id: "s0", label: "Same day", turnaround: sameDay(120), priceMinor: 80_000, surchargeMinor: null },
        { id: "s1", label: "Rush", turnaround: workingDays(1), priceMinor: 50_000, surchargeMinor: null },
      ],
    };
    const patch = listingSavePatch(working, 0);
    expect(patch.speedTiers).toEqual([
      { id: "s0", label: "Same day", turnaroundMinutes: 120, priceMinor: 80_000, surchargeMinor: null },
      { id: "s1", label: "Rush", turnaroundDays: 1, priceMinor: 50_000, surchargeMinor: null },
    ]);
    expect(JSON.stringify(patch)).not.toMatch(/Hours/);
  });

  it("keeps a measure unit the shop already chose", () => {
    expect(measureUnitFor("per_length", "cm")).toBe("cm");
    expect(measureUnitFor("per_unit", "ft")).toBeNull();
    expect(packageQtyFor("per_package", 250)).toBe(250);
    expect(packageQtyFor("per_length", 250)).toBeNull();
  });
});

describe("colour pricing", () => {
  const perPage: Listing = {
    ...listing,
    subcategoryCode: "blueprint_cad",
    pricingUnit: "per_page",
    printerMaxWidthFeet: null,
    printLayouts: ["fit_to_paper"],
    pricedByColour: false,
    oneColour: false,
    colourPricing: null,
    colourSupported: true,
  };

  it("sends nothing about colour to a GRIDGO without it", () => {
    const working = draftFrom({ ...perPage, colourSupported: false });
    expect(working.pricedByColour).toBeNull();
    expect(listingSavePatch(working, 3000)).not.toHaveProperty("pricedByColour");
    expect(listingSavePatch(working, 3000)).not.toHaveProperty("colourPricing");
  });

  it("sends the table while priced by colour, and never the one-colour flag with it", () => {
    const working = {
      ...draftFrom(perPage),
      pricedByColour: true,
      oneColour: true,
      colour: [{ key: "a", paperSize: "20x30", prices: { none: "30", up_to_25: "60" } }],
    };
    expect(colourHold(working)).toBeNull();
    expect(listingSavePatch(working, 0)).toEqual(
      expect.objectContaining({
        pricedByColour: true,
        oneColour: false,
        colourPricing: {
          sizes: [{ paperSize: "20x30", tierSet: "large_format", prices: { none: 3000, up_to_25: 6000 } }],
        },
      }),
    );
    expect(applyDraft(perPage, working).pricedByColour).toBe(true);
  });

  it("switches colour off on any other unit, and keeps the saved table by leaving it out", () => {
    const working = { ...draftFrom({ ...perPage, pricedByColour: true }), pricingUnit: "per_unit" as const, oneColour: true };
    const patch = listingSavePatch(working, 3000);
    expect(patch).toEqual(expect.objectContaining({ pricedByColour: false, oneColour: false }));
    expect(patch).not.toHaveProperty("colourPricing");
  });

  it("marks a fixed per-page listing one colour", () => {
    const working = { ...draftFrom(perPage), oneColour: true };
    expect(listingSavePatch(working, 3000)).toEqual(expect.objectContaining({ pricedByColour: false, oneColour: true }));
  });

  it("holds a table GRIDGO would refuse, and one with no print layout", () => {
    const on = { ...draftFrom(perPage), pricedByColour: true };
    expect(colourHold(on)).toBe("Add at least one paper size with its colour prices.");
    const table = { ...on, colour: [{ key: "a", paperSize: "A3", prices: { monochrome: "10" } }] };
    expect(colourHold({ ...table, printLayouts: [] })).toContain("needs at least one print layout");
    expect(colourHold(table)).toBeNull();
  });
});
