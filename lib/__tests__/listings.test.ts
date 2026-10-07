import {
  asksQuantity,
  boardBlockers,
  boardContextFor,
  boardPrompt,
  boardStanding,
  boardTargets,
  fromPriceMinor,
  hasRequiredSpec,
  measurementKind,
  multiplierLabel,
  needsPrinterCap,
  normalizeListing,
  normalizeListings,
  normalizeStarters,
  PHOTO_NEEDED,
  photoViewUrl,
  priceLine,
  printerCapLine,
  printerMaxWidthFeetForPayload,
  readyInLine,
  reviewNeeds,
  reviewsListings,
  SPECS_NEEDED,
  toMultiplierBps,
  unitLine,
  type Listing,
  type ServiceLine,
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
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  printerMaxWidthFeet: 5,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundMode: "override",
  turnaroundDays: 1,
  fileFormatMode: "override",
  formatCodes: ["pdf", "png"],
  onTheBoard: true,
  sortOrder: 0,
  photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
  groups: [],
  version: 3,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const NOTHING_INHERITED = { inheritedTurnaroundDays: null, inheritedFormatCodes: [] };

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
    expect(snake?.printerMaxWidthFeet).toBeNull();
    expect(snake?.pricingUnit).toBe("per_package");
    expect(snake?.packageQty).toBe(100);
    // An older GRIDGO's 48 hours, at its default 10-hour working day, rounded up.
    expect(snake?.turnaroundDays).toBe(5);
    expect(snake?.onTheBoard).toBe(false);
    // Photos arrive in the order the shop set, whatever order they were sent.
    expect(snake?.photos.map((photo) => photo.fileId)).toEqual(["f1", "f2"]);
    expect(snake?.groups[0].options[0].priceModifierMinor).toBe(5000);
  });

  it("reads printerMaxWidthFeet under both spellings", () => {
    expect(
      normalizeListing({
        id: "item_t",
        name: "Tarp",
        subcategoryCode: "tarpaulins_outdoor_banners",
        printerMaxWidthFeet: 5,
      })?.printerMaxWidthFeet,
    ).toBe(5);
    expect(
      normalizeListing({
        id: "item_t2",
        name: "Tarp",
        printer_max_width_feet: 7,
      })?.printerMaxWidthFeet,
    ).toBe(7);
  });

  it("keeps the signed viewing link that arrived with the listing", () => {
    const listing = normalizeListing({
      id: "item_2",
      name: "Flyers",
      photos: [
        {
          fileId: "file_lovis_flyers",
          sortOrder: 0,
          downloadUrl: "https://files.test/flyers.jpg",
          downloadUrlExpiresAt: "2099-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(listing?.photos[0].downloadUrl).toBe("https://files.test/flyers.jpg");
    expect(photoViewUrl(listing?.photos[0])).toBe("https://files.test/flyers.jpg");
    expect(
      photoViewUrl({
        fileId: "file_1",
        sortOrder: 0,
        altText: null,
        downloadUrl: "https://files.test/expired.jpg",
        downloadUrlExpiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
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

  it("reads GRIDGO's own blockers when the payload carries them", () => {
    expect(
      normalizeListing({ id: "item_b", name: "X", blockers: ["photo", "name"] })?.blockers,
    ).toEqual(["photo", "name"]);
    expect(normalizeListing({ id: "item_c", name: "X", blockers: [] })?.blockers).toEqual([]);
    expect(normalizeListing({ id: "item_d", name: "X" })?.blockers).toBeNull();
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
    expect(starters[0].turnaroundDays).toBe(3);
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
          version: 1,
          options: [
            { id: "o1", label: "3 × 5", priceModifierMinor: 15000, priceMultiplierBps: null, active: true, sortOrder: 0 },
            { id: "o2", label: "2 × 3", priceModifierMinor: 5000, priceMultiplierBps: null, active: true, sortOrder: 1 },
          ],
        },
        {
          id: "g2",
          name: "Grommets",
          kind: "addon",
          required: false,
          helpText: null,
          sortOrder: 1,
          version: 1,
          options: [
            { id: "o3", label: "Every 2ft", priceModifierMinor: 9000, priceMultiplierBps: null, active: true, sortOrder: 0 },
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
            version: 1,
            options: [
              { id: "o", label: "Greyscale", priceModifierMinor: -9000, priceMultiplierBps: null, active: true, sortOrder: 0 },
            ],
          },
        ],
      }),
    ).toBe(0);
  });

  it("says the wait in working days", () => {
    expect(readyInLine(1)).toBe("Ready in 1 working day");
    expect(readyInLine(3)).toBe("Ready in 3 working days");
    expect(readyInLine(3, 1)).toBe("Ready in 1–3 working days");
    expect(readyInLine(3, 3)).toBe("Ready in 3 working days");
    expect(readyInLine(null)).toBe("Ready-in not set");
  });
});

describe("what stops a listing going on the board", () => {
  it("says nothing when a listing is finished", () => {
    expect(boardBlockers(READY, NOTHING_INHERITED)).toEqual([]);
  });

  it("asks a tarpaulin listing for its max printer width in feet", () => {
    const unset = { ...READY, printerMaxWidthFeet: null };
    expect(boardBlockers(unset, NOTHING_INHERITED)).toEqual([
      "Set your max printer width in feet before it can go on the board.",
    ]);
    expect(boardBlockers({ ...READY, printerMaxWidthFeet: 5 }, NOTHING_INHERITED)).toEqual([]);
  });

  it("does not ask any other family for a printer cap", () => {
    const flyers: Listing = {
      ...READY,
      subcategoryCode: "flyers",
      printerMaxWidthFeet: null,
    };
    expect(needsPrinterCap("flyers")).toBe(false);
    expect(boardBlockers(flyers, NOTHING_INHERITED)).toEqual([]);
    expect(printerMaxWidthFeetForPayload("flyers", 7)).toBeNull();
    expect(printerMaxWidthFeetForPayload("tarpaulins_outdoor_banners", 7)).toBe(7);
    expect(printerMaxWidthFeetForPayload("tarpaulins_outdoor_banners", null)).toBeNull();
  });

  it("says the cap the way a client would read it", () => {
    expect(printerCapLine({ printerMaxWidthFeet: 5 })).toBe("Prints up to 5 ft");
    expect(printerCapLine({ printerMaxWidthFeet: null })).toBeNull();
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
          version: 1,
          options: [],
        },
      ],
    };
    expect(boardBlockers(empty, NOTHING_INHERITED).join(" ")).toContain("“Size”");
  });

  it("asks for a production time when neither the listing nor its category has one", () => {
    const inheriting: Listing = { ...READY, turnaroundMode: "inherit", turnaroundDays: null };
    expect(boardBlockers(inheriting, NOTHING_INHERITED).join(" ")).toContain("production time");
    expect(
      boardBlockers(inheriting, { inheritedTurnaroundDays: 2, inheritedFormatCodes: ["pdf"] }),
    ).toEqual([]);
  });
});

describe("where a listing stands", () => {
  it("shows a Super Admin take-down, the reason and when, ahead of the shop's own switch", () => {
    const standing = boardStanding(
      {
        ...READY,
        onTheBoard: false,
        suspendReason: "Blurry sample",
        suspendedAt: "2026-10-05T13:55:00.000Z",
      },
      NOTHING_INHERITED,
      true,
    );
    expect(standing.kind).toBe("suspended");
    expect(standing.label).toBe("Taken down by GRIDGO");
    expect(standing.tone).toBe("error");
    expect(standing.reason).toBe("Blurry sample");
    expect(standing.since).toBe("2026-10-05T13:55:00.000Z");
    expect(standing.note).toBe("Only GRIDGO can put it back on the board.");
  });

  it("never calls a taken-down listing Hidden, even when GRIDGO's verdict says inactive", () => {
    const standing = boardStanding(
      { ...READY, onTheBoard: false, suspendReason: "Logo on the sample" },
      NOTHING_INHERITED,
      true,
      {
        catalogItemId: READY.id,
        ready: false,
        missing: [{ code: "item_inactive", message: "This listing is hidden.", action: "activate_listing" }],
      },
    );
    expect(standing.label).toBe("Taken down by GRIDGO");
  });

  it("calls a listing the shop switched off Hidden by you", () => {
    const standing = boardStanding({ ...READY, onTheBoard: false }, NOTHING_INHERITED, true);
    expect(standing.kind).toBe("hidden");
    expect(standing.label).toBe("Hidden by you");
  });

  it("tells a waiting shop its finished listing is not visible yet", () => {
    const standing = boardStanding(READY, NOTHING_INHERITED, false);
    expect(standing.label).toBe("Waiting for shop approval");
    expect(standing.tone).toBe("info");
    expect(standing.icon).toBe("clock");
    expect(standing.note).toContain("Operations");
  });

  it("says nothing extra once the shop is approved and it is up", () => {
    const standing = boardStanding(READY, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Live");
    expect(standing.note).toBeNull();
  });

  it("calls an unfinished listing unfinished, not hidden", () => {
    const standing = boardStanding({ ...READY, photos: [] }, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Not ready yet");
    expect(standing.tone).toBe("warning");
  });

  /**
   * Captain: a listing put on the board still said "Not ready yet".
   *
   * Trigger: the wall used the phone's editor checklist (`boardBlockers`),
   * which also demands a description, a measure unit, hours and a pack count.
   * GRIDGO's `catalogItemBlockers` does not. Masking condition: the shop left
   * one of those extra fields blank — here, the description — and GRIDGO still
   * accepted the listing onto the board (`blockers: []`, `active: true`).
   * Symptom: the chip said "Not ready yet" after Put on the board.
   *
   * Earliest divergence: `boardStanding` read `boardBlockers` instead of the
   * payload's own `blockers`.
   */
  it("follows GRIDGO's blockers, not the editor's extra checklist", () => {
    const posted: Listing = {
      ...READY,
      description: "",
      blockers: [],
    };
    expect(boardBlockers(posted, NOTHING_INHERITED)[0]).toContain("what this is");
    const standing = boardStanding(posted, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Live");
    expect(standing.tone).toBe("success");
    expect(standing.icon).toBe("circle-check");
    expect(standing.note).toBeNull();
  });

  it("believes GRIDGO when a sample is still pending, even if a file id is on the listing", () => {
    const pending: Listing = {
      ...READY,
      blockers: ["photo"],
    };
    const standing = boardStanding(pending, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toContain("sample photo");
  });
});

describe("what the floor says about the board", () => {
  const services: ServiceLine[] = [];

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

  const line = (over: Partial<ServiceLine> = {}): ServiceLine => ({
    id: "svc_1",
    categoryCode: "marketing_collateral",
    state: "pending_verification",
    turnaroundDays: 2,
    formatCodes: [],
    ...over,
  });

  it("offers a category still with Operations, because approval needs a listing", () => {
    expect(boardTargets(catalog, [line({})])).toHaveLength(1);
  });

  it("does not offer a category the shop has withdrawn", () => {
    expect(boardTargets(catalog, [line({ state: "withdrawn" })])).toHaveLength(0);
  });

  it("inherits the line's turnaround and formats", () => {
    const context = boardContextFor(READY, [line({ formatCodes: ["pdf"] })]);
    expect(context).toEqual({
      inheritedTurnaroundDays: 2,
      inheritedFormatCodes: ["pdf"],
      serviceLive: false,
    });
  });
});

describe("how a shop says it sells something", () => {
  const base = READY;

  it("says the unit in words a shop and a client both use", () => {
    expect(unitLine({ ...base, pricingUnit: "per_unit", packageQty: null, measureUnit: null })).toBe("per piece");
    expect(unitLine({ ...base, pricingUnit: "per_package", packageQty: 100, measureUnit: null })).toBe("per pack of 100");
    expect(unitLine({ ...base, pricingUnit: "per_page", packageQty: null, measureUnit: null })).toBe("per page");
    expect(unitLine({ ...base, pricingUnit: "per_area", packageQty: null, measureUnit: "ft" })).toBe("per sq.ft");
    expect(unitLine({ ...base, pricingUnit: "per_length", packageQty: null, measureUnit: "in" })).toBe("per in");
    expect(unitLine({ ...base, pricingUnit: "whole_job", packageQty: null, measureUnit: null })).toBe("for the whole job");
  });

  it("knows which question each unit makes the client answer", () => {
    expect(measurementKind("per_area")).toBe("area");
    expect(measurementKind("per_length")).toBe("length");
    expect(measurementKind("per_page")).toBe("pages");
    expect(measurementKind("per_unit")).toBe("none");
    // One thing at one price: asking "how many" would be the wrong question.
    expect(asksQuantity("whole_job")).toBe(false);
    expect(asksQuantity("per_area")).toBe(true);
  });

  it("keeps a measured listing off the board until it says what it measures in", () => {
    const unmeasured = { ...base, pricingUnit: "per_area" as const, measureUnit: null };
    expect(boardBlockers(unmeasured, NOTHING_INHERITED).join(" ")).toContain("what you measure in");

    const measured = { ...base, pricingUnit: "per_area" as const, measureUnit: "ft" as const };
    expect(boardBlockers(measured, NOTHING_INHERITED).join(" ")).not.toContain("what you measure in");
  });

  it("refuses half a minimum size, because half a rule prices nothing", () => {
    const half = { ...base, pricingUnit: "per_area" as const, measureUnit: "ft" as const, minimumWidthMilli: 2000, minimumHeightMilli: null };
    expect(boardBlockers(half, NOTHING_INHERITED).join(" ")).toContain("both a width and a height");
  });

  it("reads volume breaks and speeds cheapest-quantity and fastest first", () => {
    const parsed = normalizeListing({
      id: "item",
      name: "Mugs",
      basePriceMinor: 10_000,
      pricingUnit: "per_unit",
      priceTiers: [
        { minQuantity: 250, unitPriceMinor: 6_000 },
        { minQuantity: 1, unitPriceMinor: 10_000 },
      ],
      speedTiers: [
        { id: "s5", label: "5 days", turnaroundDays: 5, priceMinor: 25_000 },
        { id: "s1", label: "1 day", turnaroundDays: 1, priceMinor: 50_000 },
      ],
    });
    expect(parsed?.priceTiers.map((tier) => tier.minQuantity)).toEqual([1, 250]);
    expect(parsed?.speedTiers.map((tier) => tier.turnaroundDays)).toEqual([1, 5]);
  });
});

describe("an extra priced as a multiple", () => {
  it("reads what a shop typed as basis points", () => {
    // "x2 the price" is 20000. Basis points because no float may reach money,
    // and a multiplier written as a flat amount stops being right the moment
    // the base price moves.
    expect(toMultiplierBps("2")).toBe(20_000);
    expect(toMultiplierBps("x2")).toBe(20_000);
    expect(toMultiplierBps("1.5")).toBe(15_000);
    expect(toMultiplierBps(" X1.25 ")).toBe(12_500);
  });

  it("refuses anything that is not a multiple", () => {
    expect(toMultiplierBps("")).toBeNull();
    expect(toMultiplierBps("free")).toBeNull();
    expect(toMultiplierBps("0")).toBeNull();
    expect(toMultiplierBps("-2")).toBeNull();
  });

  it("says it back the way a shop wrote it", () => {
    expect(multiplierLabel(20_000)).toBe("x2");
    expect(multiplierLabel(15_000)).toBe("x1.5");
  });
});

describe("listing review", () => {
  const SPEC: Listing["groups"][number] = {
    id: "grp_size",
    name: "Size",
    kind: "spec",
    required: true,
    helpText: null,
    sortOrder: 0,
    version: 1,
    options: [
      {
        id: "opt_2x3",
        label: "2 x 3 ft",
        priceModifierMinor: 0,
        priceMultiplierBps: null,
        active: true,
        sortOrder: 0,
      },
    ],
  };
  const NEW: Listing = {
    ...READY,
    groups: [SPEC],
    reviewStatus: "pending",
    reviewReason: null,
    reviewedAt: null,
    hasApprovedVersion: false,
  };

  it("reads the review fields, and treats a GRIDGO without review as approved", () => {
    const reviewed = normalizeListing({
      id: "item_r",
      active: true,
      reviewStatus: "needs_revision",
      reviewReason: "Crop the sample",
      reviewedAt: "2026-10-05T01:00:00.000Z",
      hasApprovedVersion: false,
      suspendedAt: null,
    });
    expect(reviewed?.reviewStatus).toBe("needs_revision");
    expect(reviewed?.reviewReason).toBe("Crop the sample");
    expect(reviewed?.hasApprovedVersion).toBe(false);

    const older = normalizeListing({ id: "item_o", active: true });
    expect(older?.reviewStatus).toBeNull();
    expect(older?.hasApprovedVersion).toBe(true);
    expect(reviewsListings(older!)).toBe(false);
  });

  it("is Pending review once a finished new listing is sent, and never Live before approval", () => {
    const standing = boardStanding(NEW, NOTHING_INHERITED, true);
    expect(standing.kind).toBe("pending_review");
    expect(standing.label).toBe("Pending review");
    expect(standing.note).toContain("Operations");
  });

  it("is Not ready yet with the step while the new listing is unfinished", () => {
    const standing = boardStanding({ ...NEW, photos: [] }, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toBe(PHOTO_NEEDED);
  });

  it("asks for a required spec before a new listing can be reviewed", () => {
    const standing = boardStanding({ ...NEW, groups: [] }, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toBe(SPECS_NEEDED);
    expect(reviewNeeds({ ...NEW, groups: [] }, NOTHING_INHERITED)).toContain(SPECS_NEEDED);
    expect(hasRequiredSpec({ ...NEW, groups: [{ ...SPEC, required: false }] })).toBe(false);
    expect(hasRequiredSpec(NEW)).toBe(true);
  });

  it("is Needs changes with Operations' reason when a new listing is sent back", () => {
    const standing = boardStanding(
      { ...NEW, reviewStatus: "needs_revision", reviewReason: "Sample shows a logo", reviewedAt: "2026-10-05T02:00:00.000Z" },
      NOTHING_INHERITED,
      true,
    );
    expect(standing.kind).toBe("needs_changes");
    expect(standing.label).toBe("Needs changes");
    expect(standing.reason).toBe("Sample shows a logo");
    expect(standing.since).toBe("2026-10-05T02:00:00.000Z");
  });

  it("ignores GRIDGO's not-approved step and names the real one for a new listing", () => {
    const standing = boardStanding(NEW, NOTHING_INHERITED, true, {
      catalogItemId: NEW.id,
      ready: false,
      missing: [
        { code: "listing_not_approved", message: "Operations must approve this listing.", action: "view_listing_review" },
        { code: "photo", message: "Attach at least one fully uploaded listing photo.", action: "upload_listing_photo" },
      ],
    });
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toBe("Attach at least one fully uploaded listing photo.");
  });

  it("still names the draft's own gap when GRIDGO's verdict was read before the edit", () => {
    const standing = boardStanding({ ...NEW, photos: [] }, NOTHING_INHERITED, true, {
      catalogItemId: NEW.id,
      ready: true,
      missing: [],
    });
    expect(standing.label).toBe("Not ready yet");
    expect(standing.note).toBe(PHOTO_NEEDED);
  });

  it("keeps an approved listing Live while an edit waits for review, and says so beside it", () => {
    const standing = boardStanding(
      { ...NEW, hasApprovedVersion: true, reviewStatus: "pending" },
      NOTHING_INHERITED,
      true,
      { catalogItemId: NEW.id, ready: true, missing: [] },
    );
    expect(standing.label).toBe("Live");
    expect(standing.revision?.label).toBe("Pending review");
    expect(standing.revision?.note).toContain("approved version");
  });

  it("keeps an approved listing Live when its changes are sent back, with the reason", () => {
    const standing = boardStanding(
      { ...NEW, hasApprovedVersion: true, reviewStatus: "needs_revision", reviewReason: "Price is per piece" },
      NOTHING_INHERITED,
      true,
    );
    expect(standing.label).toBe("Live");
    expect(standing.revision?.label).toBe("Needs changes");
    expect(standing.revision?.reason).toBe("Price is per piece");
  });

  it("draws no revision on an approved listing with nothing pending", () => {
    const standing = boardStanding({ ...NEW, hasApprovedVersion: true, reviewStatus: "approved" }, NOTHING_INHERITED, true);
    expect(standing.label).toBe("Live");
    expect(standing.revision).toBeNull();
  });
});
