import { draftFrom, listingSavePatch, measureUnitFor, packageQtyFor } from "@/lib/listingDraft";
import type { Listing } from "@/lib/listings";

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
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundMode: "inherit",
  turnaroundDays: null,
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
      minimumTurnaroundDays: 1,
      turnaroundDays: 3,
    };
    expect(listingSavePatch(working, 0)).toEqual(
      expect.objectContaining({
        turnaroundMode: "override",
        minimumTurnaroundDays: 1,
        turnaroundDays: 3,
      }),
    );
  });

  it("clears both days when the listing follows its category, and sends speeds in days", () => {
    const working = {
      ...draftFrom(listing),
      turnaroundMode: "inherit" as const,
      minimumTurnaroundDays: 1,
      turnaroundDays: 3,
      speedTiers: [{ id: "s1", label: "Express", turnaroundDays: 1, priceMinor: 50_000, surchargeMinor: null }],
    };
    const patch = listingSavePatch(working, 0);
    expect(patch).toEqual(
      expect.objectContaining({ minimumTurnaroundDays: null, turnaroundDays: null }),
    );
    expect(patch.speedTiers).toEqual([
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
