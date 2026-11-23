import { normalizeListing } from "@/lib/listings";
import {
  checkProductsLine,
  draftRows,
  fromPriceLine,
  moreOptionsBlocker,
  moreOptionsBody,
  moreOptionsFrom,
  normalizeCatalogue,
  PRICE_REQUIRED,
  priceBlocker,
  priceErrors,
  pricesBody,
  productHref,
  readyByLine,
  serviceFor,
  templateStanding,
  type DraftRow,
} from "@/lib/productTemplates";

/** A slice of GRIDGO's `GET /me/product-templates` answer (gridgo-api `docs/PRODUCT_TEMPLATES_API.md`). */
const catalogueBody = {
  templates: [
    {
      id: "tpl_flyers",
      version: 1,
      active: true,
      name: "Flyers",
      description: "Flyers made to your selected specifications.",
      categoryCode: "marketing_print",
      subcategoryCode: "flyers",
      group: "marketing",
      unit: "piece",
      options: [
        { key: "standard", label: "A5 / Glossy" },
        { key: "variant_1", label: "A4 / Glossy" },
      ],
      optionLists: [{ name: "Size", options: ["A5", "A4"] }],
      stockPhotos: [{ url: "/product-template-photos/lst_flyers.jpg", altText: "Flyers" }],
      fileTypes: ["pdf"],
      clientTips: ["Send a clear, print-ready file."],
      express: false,
      machinesNeeded: ["specialist_equipment"],
      priceRange: { minMinor: 100, maxMinor: 500000 },
      addedItemIds: ["sci_9"],
      machineMatch: null,
    },
    { id: "broken" },
  ],
  readyTimes: [
    { code: "same_day", label: "Same day", productionTime: { mode: "same_day", hours: 2 } },
    { code: "next_day", label: "Next working day" },
  ],
  checkYourProducts: { supplierId: "u1", actions: [{ itemId: "a" }, { itemId: "b" }], manual: [], unpricedItemIds: ["sci_1"] },
};

describe("reading GRIDGO's templates", () => {
  it("keeps only templates it can draw, with the stock photo joined to the API base", () => {
    const catalogue = normalizeCatalogue(catalogueBody);
    expect(catalogue.templates).toHaveLength(1);
    const [flyers] = catalogue.templates;
    expect(flyers.options.map((o) => o.label)).toEqual(["A5 / Glossy", "A4 / Glossy"]);
    expect(flyers.photoUrl).toMatch(/^https?:\/\/.+\/product-template-photos\/lst_flyers\.jpg$/);
    expect(flyers.addedItemIds).toEqual(["sci_9"]);
    expect(catalogue.readyTimes.map((c) => c.code)).toEqual(["same_day", "next_day"]);
    expect(catalogue.check).toEqual({ unpricedItemIds: ["sci_1"], suggestedCount: 2 });
  });

  it("reads an older GRIDGO's empty answer as no templates rather than throwing", () => {
    expect(normalizeCatalogue(null)).toEqual({
      templates: [],
      readyTimes: [],
      check: { unpricedItemIds: [], suggestedCount: 0 },
    });
  });

  it("finds the shop's own service line for a template, through a retired code too", () => {
    const [flyers] = normalizeCatalogue(catalogueBody).templates;
    const catalog = { categories: [], source: "platform" as const, canDeclare: true, aliases: { old_marketing: "marketing_print" } };
    expect(serviceFor(flyers, [{ id: "svc_old", categoryCode: "old_marketing" }], catalog)?.id).toBe("svc_old");
    expect(serviceFor(flyers, [{ id: "svc_docs", categoryCode: "documents" }], catalog)).toBeNull();
  });
});

describe("the ₱0 block", () => {
  const rows: DraftRow[] = [
    { optionKey: "standard", on: true, price: "" },
    { optionKey: "variant_1", on: true, price: "0" },
    { optionKey: "variant_2", on: true, price: "0.00" },
    { optionKey: "variant_3", on: false, price: "" },
    { optionKey: "variant_4", on: true, price: "12.50" },
  ];

  it("refuses an empty or zero price on every ticked row, and says what to fix", () => {
    expect(priceErrors(rows)).toEqual({
      standard: PRICE_REQUIRED,
      variant_1: PRICE_REQUIRED,
      variant_2: PRICE_REQUIRED,
    });
    expect(priceBlocker(rows)).toBe("3 ticked options need a price above ₱0.");
  });

  it("asks for at least one ticked option", () => {
    expect(priceBlocker(rows.map((r) => ({ ...r, on: false })))).toBe("Tick at least one option you make.");
  });

  it("sends each ticked row as its full price in centavos, never an add-on", () => {
    const ok: DraftRow[] = [
      { optionKey: "standard", on: true, price: "10" },
      { optionKey: "variant_1", on: true, price: "18.50" },
      { optionKey: "variant_3", on: false, price: "99" },
    ];
    expect(priceBlocker(ok)).toBeNull();
    expect(pricesBody(ok)).toEqual([
      { optionKey: "standard", priceMinor: 1000 },
      { optionKey: "variant_1", priceMinor: 1850 },
    ]);
    expect(fromPriceLine(ok, "page")).toBe("From ₱10.00 per page");
  });

  it("fills a saved table back in, unticking what the shop does not make", () => {
    const [flyers] = normalizeCatalogue(catalogueBody).templates;
    expect(draftRows(flyers, [{ optionKey: "variant_1", priceMinor: 1850 }])).toEqual([
      { optionKey: "standard", on: false, price: "" },
      { optionKey: "variant_1", on: true, price: "18.50" },
    ]);
  });
});

describe("More options", () => {
  const empty = { minimumOrder: "", bulkFrom: "", bulkPrice: "", rushHours: "", rushFee: "", tips: "" };

  it("clears bulk and rush when nothing is set, as GRIDGO documents", () => {
    expect(moreOptionsBody(empty)).toEqual({ minimumOrderQuantity: null, priceTiers: [], speedTiers: [] });
  });

  it("sends bulk, rush, minimum and tips in their catalogue shapes", () => {
    expect(
      moreOptionsBody({ minimumOrder: "10", bulkFrom: "100", bulkPrice: "8", rushHours: "2", rushFee: "50", tips: " PDF please " }),
    ).toEqual({
      minimumOrderQuantity: 10,
      priceTiers: [{ minQuantity: 100, unitPriceMinor: 800 }],
      speedTiers: [{ label: "Rush", turnaroundMinutes: 120, priceMinor: null, surchargeMinor: 5000 }],
      clientTips: "PDF please",
    });
  });

  it("names the half-filled option and the fix", () => {
    expect(moreOptionsBlocker({ ...empty, bulkFrom: "50" })).toBe("Bulk discount: enter the price each, above ₱0.");
    expect(moreOptionsBlocker({ ...empty, rushFee: "50" })).toBe("Rush: enter how many hours it takes, 1 to 24.");
    expect(moreOptionsBlocker({ ...empty, bulkFrom: "100", bulkPrice: "0" })).toBe(
      "Bulk discount: enter the price each, above ₱0.",
    );
    expect(moreOptionsBlocker(empty)).toBeNull();
  });

  it("reads a saved product back, keeping GRIDGO's own tips out of the shop's field", () => {
    expect(
      moreOptionsFrom({
        minimumOrderQuantity: 5,
        priceTiers: [{ minQuantity: 100, unitPriceMinor: 850 }],
        speedTiers: [{ turnaround: { unit: "hours", minutes: 180 }, surchargeMinor: 2500 }],
        clientTips: ["Send a clear, print-ready file."],
        templateTips: ["Send a clear, print-ready file."],
      }),
    ).toEqual({ minimumOrder: "5", bulkFrom: "100", bulkPrice: "8.50", rushHours: "3", rushFee: "25", tips: "" });
  });
});

describe("a saved template product", () => {
  const raw = {
    id: "sci_1",
    name: "Flyers",
    active: false,
    reviewStatus: "pending",
    hasApprovedVersion: false,
    version: 4,
    photos: [{ url: "/product-template-photos/lst_flyers.jpg", downloadUrl: "/product-template-photos/lst_flyers.jpg", realPhoto: false }],
    template: {
      templateId: "tpl_flyers",
      managed: true,
      shopConfirmed: false,
      readyTime: "next_day",
      priceCheck: { flags: [{ optionKey: "variant_1", code: "outside_usual_range" }] },
    },
  };

  it("reads its template facts and its stock photo without a file id", () => {
    const listing = normalizeListing(raw)!;
    expect(listing.photos).toEqual([]);
    expect(listing.stockPhotoUrl).toMatch(/\/product-template-photos\/lst_flyers\.jpg$/);
    expect(listing.template).toMatchObject({ templateId: "tpl_flyers", shopConfirmed: false, flaggedOptionKeys: ["variant_1"] });
    expect(productHref(listing)).toBe("/shop/product/sci_1");
  });

  it("leaves a custom product on today's builder", () => {
    const custom = normalizeListing({ id: "sci_2", name: "Mugs" })!;
    expect(custom.template).toBeUndefined();
    expect(productHref(custom)).toBe("/shop/sci_2");
  });

  it("says plainly what it is waiting on, and when the switch may move", () => {
    const listing = normalizeListing(raw)!;
    expect(templateStanding(listing)).toMatchObject({ label: "Prices to confirm", switchable: false });
    const confirmed = normalizeListing({ ...raw, template: { ...raw.template, shopConfirmed: true } })!;
    expect(templateStanding(confirmed)).toMatchObject({ label: "Hidden", switchable: true });
    const live = normalizeListing({ ...raw, active: true, template: { ...raw.template, shopConfirmed: true } })!;
    expect(templateStanding(live)).toMatchObject({ label: "Price check today", switchable: true });
    const approved = normalizeListing({
      ...raw,
      active: true,
      reviewStatus: "approved",
      hasApprovedVersion: true,
      template: { ...raw.template, shopConfirmed: true },
    })!;
    expect(templateStanding(approved).label).toBe("Live");
    const unpriced = normalizeListing({ ...raw, template: { ...raw.template, needsPrice: true } })!;
    expect(templateStanding(unpriced)).toMatchObject({ label: "Needs a price", switchable: false });
  });

  it("counts what Check your products is about", () => {
    expect(
      checkProductsLine([
        { template: normalizeListing({ ...raw, template: { ...raw.template, needsPrice: true } })!.template },
        { template: normalizeListing(raw)!.template },
      ]),
    ).toBe("1 needs a price, 1 with prices from GRIDGO to confirm. Hidden from clients until you do.");
  });
});

describe("the ready-by example", () => {
  it("is GRIDGO's own date, on the shop's clock", () => {
    expect(readyByLine({ earliestReadyBy: new Date("2026-11-25T07:00:00.000Z") })).toBe(
      "Ordered now, ready by Wed 25 Nov, 3:00 PM",
    );
    expect(readyByLine(null)).toBeNull();
  });
});

describe("an older product hidden until priced", () => {
  it("opens its price table, while one the team only matched keeps today's builder", () => {
    expect(productHref(normalizeListing({ id: "sci_3", name: "Old", template: { templateId: null, needsPrice: true } })!)).toBe(
      "/shop/product/sci_3",
    );
    expect(productHref(normalizeListing({ id: "sci_4", name: "Old", template: { templateId: "tpl_flyers" } })!)).toBe("/shop/sci_4");
  });
});
