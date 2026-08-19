import type { SupplierService } from "@/lib/api";
import {
  boardBlockers,
  boardContextFor,
  boardPrompt,
  boardStanding,
  boardTargets,
  fromPriceMinor,
  normalizeListing,
  normalizeListings,
  normalizeStarters,
  priceLine,
  readyInLine,
  unitLine,
  type Listing,
} from "@/lib/listings";
import { buildCatalog } from "@/lib/taxonomy";

const READY: Listing = {
  id: "item_1",
  serviceLineId: "svc_1",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin, 13oz",
  description: "Printed on 13oz matte tarpaulin, eyelets every two feet.",
  basePriceMinor: 45000,
  pricingUnit: "per_unit",
  packageQty: null,
  turnaroundMode: "override",
  turnaroundHours: 24,
  fileFormatMode: "override",
  formatCodes: ["pdf", "png"],
  onTheBoard: true,
  sortOrder: 0,
  photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
  groups: [],
  version: 3,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const NOTHING_INHERITED = { inheritedTurnaroundHours: null, inheritedFormatCodes: [] };

describe("reading what GRIDGO sends", () => {
  it("reads the platform's own spelling and its snake_case twin", () => {
    const snake = normalizeListing({
      id: "item_9",
      supplier_service_id: "svc_9",
      subcategory_code: "flyers",
      name: "Flyers",
      description: "A5, full colour",
      base_price_minor: 120000,
      pricing_unit: "per_package",
      package_qty: 100,
      turnaround_mode: "override",
      turnaround_hours: 48,
      file_format_mode: "override",
      format_codes: ["pdf"],
      active: false,
      photos: [{ file_id: "f2", sort_order: 1 }, { file_id: "f1", sort_order: 0 }],
      option_groups: [
        {
          id: "g1",
          name: "Paper",
          kind: "spec",
          sort_order: 0,
          options: [{ id: "o1", label: "Matte", price_modifier_minor: 5000, sort_order: 0 }],
        },
      ],
    });

    expect(snake?.serviceLineId).toBe("svc_9");
    expect(snake?.pricingUnit).toBe("per_package");
    expect(snake?.packageQty).toBe(100);
    expect(snake?.onTheBoard).toBe(false);
    // Photos arrive in the order the shop set, whatever order they were sent.
    expect(snake?.photos.map((photo) => photo.fileId)).toEqual(["f1", "f2"]);
    expect(snake?.groups[0].options[0].priceModifierMinor).toBe(5000);
  });

  it("reads photos sent as bare file ids", () => {
    const listing = normalizeListing({ id: "item_2", name: "X", photos: ["a", "b"] });
    expect(listing?.photos.map((photo) => photo.fileId)).toEqual(["a", "b"]);
  });

  it("treats an add-on as never required, whatever the payload says", () => {
    const listing = normalizeListing({
      id: "item_3",
      name: "X",
      optionGroups: [{ id: "g", name: "Grommets", kind: "addon", required: true, options: [] }],
    });
    expect(listing?.groups[0].required).toBe(false);
  });

  it("drops records with no identity rather than rendering a blank tile", () => {
    expect(normalizeListing({ name: "No id" })).toBeNull();
    expect(normalizeListings({ items: [{ name: "No id" }, { id: "ok", name: "Ok" }] })).toHaveLength(1);
  });

  it("reads a starter's shape and counts what it brings", () => {
    const starters = normalizeStarters({
      starters: [
        {
          id: "st_1",
          name: "Tarpaulin",
          subcategory_code: "tarpaulins_outdoor_banners",
          default_pricing_unit: "per_unit",
          default_turnaround_hours: 24,
          default_format_codes: ["pdf", "png"],
          groups: [{ kind: "spec" }, { kind: "spec" }, { kind: "addon" }],
        },
      ],
    });

    expect(starters[0].specCount).toBe(2);
    expect(starters[0].addOnCount).toBe(1);
    expect(starters[0].formatCodes).toEqual(["pdf", "png"]);
  });
});

describe("what a listing costs", () => {
  it("says the unit the way a shop says it", () => {
    expect(unitLine(READY)).toBe("per piece");
    expect(unitLine({ ...READY, pricingUnit: "per_package", packageQty: 100 })).toBe(
      "per pack of 100",
    );
  });

  it("adds the cheapest option of every required step, and nothing else", () => {
    const withSteps: Listing = {
      ...READY,
      groups: [
        {
          id: "g1",
          name: "Size",
          kind: "spec",
          required: true,
          helpText: null,
          sortOrder: 0,
          options: [
            { id: "o1", label: "3 × 5", priceModifierMinor: 15000, active: true, sortOrder: 0 },
            { id: "o2", label: "2 × 3", priceModifierMinor: 5000, active: true, sortOrder: 1 },
          ],
        },
        {
          id: "g2",
          name: "Grommets",
          kind: "addon",
          required: false,
          helpText: null,
          sortOrder: 1,
          options: [
            { id: "o3", label: "Every 2ft", priceModifierMinor: 9000, active: true, sortOrder: 0 },
          ],
        },
      ],
    };

    expect(fromPriceMinor(withSteps)).toBe(50000);
    expect(priceLine(withSteps)).toBe("From ₱500.00 per piece");
    // One option in a required step is a fixed price, not a range.
    expect(priceLine(READY)).toBe("₱450.00 per piece");
  });

  it("never quotes below zero, however deep the discounts go", () => {
    expect(
      fromPriceMinor({
        ...READY,
        basePriceMinor: 1000,
        groups: [
          {
            id: "g",
            name: "Colour",
            kind: "spec",
            required: true,
            helpText: null,
            sortOrder: 0,
            options: [
              { id: "o", label: "Greyscale", priceModifierMinor: -9000, active: true, sortOrder: 0 },
            ],
          },
        ],
      }),
    ).toBe(0);
  });

  it("says the wait in the unit a shop would say it in", () => {
    expect(readyInLine(24)).toBe("Ready in 24 hours");
    expect(readyInLine(72)).toBe("Ready in 3 days");
    expect(readyInLine(null)).toBe("Ready-in not set");
  });
});

describe("what stops a listing going on the board", () => {
  it("says nothing when a listing is finished", () => {
    expect(boardBlockers(READY, NOTHING_INHERITED)).toEqual([]);
  });

  it("leads with the photo, because that is what a client picks with", () => {
    const bare: Listing = {
      ...READY,
      photos: [],
      name: "",
      description: "",
      basePriceMinor: 0,
    };
    expect(boardBlockers(bare, NOTHING_INHERITED)[0]).toContain("sample photo");
  });

  it("names the pack size only when the price is a pack price", () => {
    const pack: Listing = { ...READY, pricingUnit: "per_package", packageQty: null };
    expect(boardBlockers(pack, NOTHING_INHERITED).some((line) => line.includes("pack"))).toBe(true);
    expect(boardBlockers(READY, NOTHING_INHERITED)).toEqual([]);
  });

  it("names the step a client could not answer", () => {
    const empty: Listing = {
      ...READY,
      groups: [
        {
          id: "g",
          name: "Size",
          kind: "spec",
          required: true,
          helpText: null,
          sortOrder: 0,
          options: [],
        },
      ],
    };
    expect(boardBlockers(empty, NOTHING_INHERITED).join(" ")).toContain("“Size”");
  });

  it("asks for a turnaround when neither the listing nor its category has one", () => {
    const inheriting: Listing = { ...READY, turnaroundMode: "inherit", turnaroundHours: null };
    expect(boardBlockers(inheriting, NOTHING_INHERITED).join(" ")).toContain("turnaround");
    expect(
      boardBlockers(inheriting, { inheritedTurnaroundHours: 48, inheritedFormatCodes: ["pdf"] }),
    ).toEqual([]);
  });
});

describe("where a listing stands", () => {
  it("tells a waiting shop its finished listing is not visible yet", () => {
    const standing = boardStanding(READY, NOTHING_INHERITED, false);
    expect(standing.label).toBe("On the board");
    expect(standing.note).toContain("Operations");
  });

  it("says nothing extra once the shop is approved and it is up", () => {
    expect(boardStanding(READY, NOTHING_INHERITED, true).note).toBeNull();
  });

  it("calls an unfinished listing unfinished, not hidden", () => {
    const standing = boardStanding({ ...READY, photos: [] }, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Not ready yet");
    expect(standing.tone).toBe("warning");
  });
});

describe("what the floor says about the board", () => {
  const services: SupplierService[] = [];

  it("invites an empty board to open, in the words of the shop's own wait", () => {
    expect(boardPrompt([], services, true).body).toContain("Clients pick a shop");
    expect(boardPrompt([], services, false).body).toContain("Operations");
  });

  it("names the listing that is not finished, and what it needs", () => {
    const prompt = boardPrompt([{ ...READY, photos: [] }], services, true);
    expect(prompt.kind).toBe("incomplete");
    expect(prompt.body).toContain("Tarpaulin, 13oz");
    expect(prompt.body).toContain("sample photo");
  });

  it("drops to a quiet strip once every listing is finished", () => {
    expect(boardPrompt([READY], services, true).kind).toBe("ready");
  });
});

describe("where a shop may file a listing", () => {
  const catalog = buildCatalog({
    categories: [{ code: "marketing_collateral", name: "Marketing", active: true }],
    subcategories: [
      { code: "flyers", name: "Flyers", categoryCode: "marketing_collateral", active: true },
    ],
    materials: [],
    finishes: [],
  });

  const line = (over: Partial<SupplierService>): SupplierService =>
    ({
      id: "svc_1",
      supplierId: "u1",
      categoryCode: "marketing_collateral",
      materialCodes: [],
      finishCodes: [],
      productFamilyIds: [],
      sizeMin: null,
      sizeMax: null,
      qtyMin: null,
      qtyMax: null,
      pricingBasis: "",
      referenceRateMinor: 0,
      turnaroundHours: 48,
      capacityDaily: null,
      capacityWeekly: null,
      zones: [],
      equipmentNotes: "",
      state: "pending_verification",
      verifiedAt: null,
      suspendedAt: null,
      suspendReason: null,
      withdrawnAt: null,
      createdAt: "",
      updatedAt: "",
      ...over,
    }) as SupplierService;

  it("offers a category still with Operations, because approval needs a listing", () => {
    expect(boardTargets(catalog, [line({})])).toHaveLength(1);
  });

  it("does not offer a category the shop has withdrawn", () => {
    expect(boardTargets(catalog, [line({ state: "withdrawn" })])).toHaveLength(0);
  });

  it("inherits the line's turnaround and formats", () => {
    const context = boardContextFor(READY, [line({ formatCodes: ["pdf"] })]);
    expect(context).toEqual({ inheritedTurnaroundHours: 48, inheritedFormatCodes: ["pdf"] });
  });
});
