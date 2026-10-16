import { applyDraft, colourHold, draftFrom, listingSavePatch, measureUnitFor, packageQtyFor } from "@/lib/listingDraft";
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

  it("sends the soonest and latest working days when the listing overrides ready-in", () => {
    const working = {
      ...draftFrom(listing),
      turnaroundMode: "override" as const,
      minimumTurnaround: workingDays(1),
      turnaround: workingDays(3),
    };
    expect(listingSavePatch(working, 0)).toEqual(
      expect.objectContaining({
        turnaroundMode: "override",
        minimumTurnaroundDays: 1,
        turnaroundDays: 3,
      }),
    );
  });

  it("sends a same-day window as minutes, and only the chosen unit's field", () => {
    const working = {
      ...draftFrom(listing),
      turnaroundMode: "override" as const,
      minimumTurnaround: sameDay(60),
      turnaround: sameDay(150),
    };
    const patch = listingSavePatch(working, 0);
    expect(patch).toEqual(
      expect.objectContaining({ minimumTurnaroundMinutes: 60, turnaroundMinutes: 150 }),
    );
    expect(patch).not.toHaveProperty("turnaroundDays");
    expect(patch).not.toHaveProperty("minimumTurnaroundDays");
  });

  it("clears the window when the listing follows its category, and sends each speed in its own unit", () => {
    const working = {
      ...draftFrom(listing),
      turnaroundMode: "inherit" as const,
      minimumTurnaround: workingDays(1),
      turnaround: workingDays(3),
      speedTiers: [
        { id: "s0", label: "Same day", turnaround: sameDay(120), priceMinor: 80_000, surchargeMinor: null },
        { id: "s1", label: "Express", turnaround: workingDays(1), priceMinor: 50_000, surchargeMinor: null },
      ],
    };
    const patch = listingSavePatch(working, 0);
    expect(patch).toEqual(
      expect.objectContaining({ minimumTurnaroundDays: null, turnaroundDays: null }),
    );
    expect(patch.speedTiers).toEqual([
      { id: "s0", label: "Same day", turnaroundMinutes: 120, priceMinor: 80_000, surchargeMinor: null },
      { id: "s1", label: "Express", turnaroundDays: 1, priceMinor: 50_000, surchargeMinor: null },
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
