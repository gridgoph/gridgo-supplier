import {
  addGroup,
  addOption,
  addPrepStep,
  createListing,
  loadBoard,
  loadListing,
  removeListing,
  removePhoto,
  reorderPrepSteps,
  applyProductionTimeToAll,
  loadListingCount,
  loadProductionTimePreview,
  saveListing,
} from "@/lib/listingsApi";
import type { Listing, PrepStep, SpecGroup } from "@/lib/listings";

/**
 * What this app actually puts on the wire.
 *
 * Every bug behind this file was invisible from the screen and obvious from the
 * request: a listing that would not open, a step that would not save, a second
 * choice refused for a position nobody chose, and a Remove button that did
 * nothing. So these assert the request rather than the render — the screens are
 * covered elsewhere, and none of these would have been caught there.
 *
 * `docs/SUPPLIER_CATALOG_API.md` in gridgo-api is the contract being pinned.
 */

function answered(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? "" : JSON.stringify(body)),
  } as Response;
}

/** The last call's method, parsed body and headers, in one place. */
function sent(fetch: jest.SpyInstance, index = 0) {
  const [url, init] = fetch.mock.calls[index] as [string, RequestInit];
  return {
    url,
    method: init.method ?? "GET",
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
  };
}

const group: SpecGroup = {
  id: "cog_1",
  name: "Rush",
  kind: "addon",
  required: false,
  helpText: null,
  sortOrder: 0,
  version: 4,
  options: [
    {
      id: "cop_1",
      label: "Ready in 24 hours",
      priceModifierMinor: 20000,
      priceMultiplierBps: null,
      active: true,
      sortOrder: 0,
    },
  ],
};

const listing: Listing = {
  id: "sci_1",
  serviceLineId: "svc_1",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin, 13oz",
  description: "",
  basePriceMinor: 45000,
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
  groups: [group],
  version: 7,
  updatedAt: null,
};

function step(id: string, sortOrder: number): PrepStep {
  return { id, title: `Step ${sortOrder}`, body: "", sortOrder };
}

describe("what the board sends GRIDGO", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * The hunt is a GRIDGO predicate, so the whole question has to reach the
   * wire. A parameter dropped here is a filter that silently stops filtering:
   * the wall still draws a page, so nothing looks broken.
   */
  it("puts the hunt, the cut, the sort and the page in the query string", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(200, { items: [], total: 0 }));

    await loadBoard({
      q: "gold foil",
      sort: "price_low",
      subcategoryCode: "flyers",
      active: false,
      limit: 8,
      cursor: "cur_2",
    });

    const url = new URL(sent(fetch).url, "http://gridgo.test");
    expect(url.pathname).toBe("/me/catalog-items");
    expect(url.searchParams.get("q")).toBe("gold foil");
    expect(url.searchParams.get("sort")).toBe("price_low");
    expect(url.searchParams.get("subcategoryCode")).toBe("flyers");
    expect(url.searchParams.get("active")).toBe("false");
    expect(url.searchParams.get("limit")).toBe("8");
    expect(url.searchParams.get("cursor")).toBe("cur_2");
  });

  /** A blank hunt is the whole board, not a hunt for nothing. */
  it("leaves an empty hunt off the wire entirely", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(200, { items: [], total: 0 }));

    await loadBoard({ q: "   ", sort: "board", active: null, limit: 8, cursor: null });

    const url = new URL(sent(fetch).url, "http://gridgo.test");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("active")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.get("limit")).toBe("8");
  });

  /**
   * GRIDGO ranks a hunt and sorts a board; re-sorting the page here would put
   * the worst match first and undo the sort the shop just chose.
   */
  it("keeps the page in the order GRIDGO answered with", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      answered(200, {
        items: [
          { ...listing, id: "sci_2", name: "Zebra tarp", sortOrder: 9 },
          { ...listing, id: "sci_3", name: "Alpha tarp", sortOrder: 0 },
        ],
        nextCursor: "cur_2",
        total: 12,
      }),
    );

    const result = await loadBoard({ sort: "name" });

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected a page");
    expect(result.value.listings.map((item) => item.name)).toEqual([
      "Zebra tarp",
      "Alpha tarp",
    ]);
    expect(result.value.nextCursor).toBe("cur_2");
    expect(result.value.total).toBe(12);
  });

  /**
   * The captain's report: Remove this listing does nothing. GRIDGO answered
   * `400 expected_version_required` to a body-less DELETE. Putting the version
   * only in `If-Match` then failed on web (CORS), so it travels as a query.
   */
  it("removes a listing with its version on the query", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(200, { ok: true }));

    const result = await removeListing(listing);

    const call = sent(fetch);
    expect(call.method).toBe("DELETE");
    expect(call.url).toContain("/me/catalog-items/sci_1");
    expect(call.url).toContain("expectedVersion=7");
    expect(call.body).toBeNull();
    expect(call.headers["If-Match"]).toBeUndefined();
    expect(result).toEqual({ status: "ok", value: "deleted" });
  });

  /** A listing a client already ordered from comes back, still there. */
  it("calls a listing GRIDGO kept for a job archived, not deleted", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(200, { item: { ...listing, active: false } }));

    expect(await removeListing(listing)).toEqual({ status: "ok", value: "archived" });
  });

  /** `POST .../option-groups 400 expected_version_required`, from the phone. */
  it("opens a step with the listing's version and the first choice", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(answered(201, { group }));

    await addGroup(listing, {
      name: "Size",
      kind: "spec",
      required: true,
      firstOption: { label: "2 × 3 ft", priceModifierMinor: 0 },
    });

    const call = sent(fetch);
    expect(call.method).toBe("POST");
    expect(call.headers["If-Match"]).toBe("7");
    expect(call.body).toMatchObject({
      expectedVersion: 7,
      name: "Size",
      kind: "spec",
      required: true,
      options: [{ label: "2 × 3 ft", priceModifierMinor: 0, sortOrder: 0 }],
    });
  });

  /**
   * Positions are chosen here, not left to GRIDGO. A choice with no position
   * is read as position zero — which the group's first choice already holds —
   * so the second choice a shop ever adds used to come back refused.
   */
  it("adds a second choice at a free position, not on top of the first", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(answered(201, {}));

    await addOption(group, { label: "Ready in 12 hours", priceModifierMinor: 40000 });

    const call = sent(fetch);
    expect(call.url).toContain("/me/catalog-option-groups/cog_1/options");
    expect(call.body).toEqual({
      expectedVersion: 4,
      label: "Ready in 12 hours",
      priceModifierMinor: 40000,
      sortOrder: 1,
    });
    // A choice belongs to its group, so it carries the group's version.
    expect(call.headers["If-Match"]).toBe("4");
  });

  /** A gap left by a removed step must not be read as the end of the list. */
  it("adds a step into the gap a removed one left", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(answered(201, {}));

    await addPrepStep(listing, [step("cps_2", 1), step("cps_3", 2)], {
      title: "Outline your fonts",
      body: "",
    });

    expect(sent(fetch).body).toMatchObject({ sortOrder: 0, expectedVersion: 7 });
  });

  /** Steps move as a whole set; two swapping would collide one at a time. */
  it("takes a sample off by sending the photos that stay", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(answered(200, {}));
    const withPhotos: Listing = {
      ...listing,
      photos: [
        { fileId: "file_keep", sortOrder: 0, altText: null },
        { fileId: "file_drop", sortOrder: 1, altText: null },
      ],
    };

    await removePhoto(withPhotos, "file_drop");

    const call = sent(fetch);
    expect(call.url).toContain("/me/catalog-items/sci_1/photos/reorder");
    expect(call.body).toEqual({ fileIds: ["file_keep"], expectedVersion: 7 });
  });

  it("reorders steps by sending every one of them", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(answered(200, {}));

    await reorderPrepSteps(listing, [step("cps_2", 1), step("cps_1", 0)]);

    const call = sent(fetch);
    expect(call.url).toContain("/me/catalog-items/sci_1/prep-steps/reorder");
    expect(call.body).toEqual({ stepIds: ["cps_2", "cps_1"], expectedVersion: 7 });
  });
});

describe("the printer cap on the wire", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("names printerMaxWidthFeet on a tarpaulin create and omits it on every other family", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(201, { item: listing }));

    await createListing({
      serviceLineId: "svc_1",
      subcategoryCode: "tarpaulins_outdoor_banners",
      name: "Tarpaulin, 13oz",
      printerMaxWidthFeet: 5,
    });
    expect(sent(fetch).body).toEqual(
      expect.objectContaining({ printerMaxWidthFeet: 5, subcategoryCode: "tarpaulins_outdoor_banners" }),
    );

    fetch.mockClear();
    await createListing({
      serviceLineId: "svc_1",
      subcategoryCode: "flyers",
      name: "Flyers 101",
      printerMaxWidthFeet: 5,
    });
    expect(sent(fetch).body).not.toHaveProperty("printerMaxWidthFeet");
    expect(sent(fetch).body?.subcategoryCode).toBe("flyers");
  });

  it("clears a leftover number when the kind of work is no longer tarpaulin", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(200, { item: listing }));

    await saveListing(listing, {
      subcategoryCode: "flyers",
      printerMaxWidthFeet: 5,
    });

    expect(sent(fetch).body).toEqual(
      expect.objectContaining({
        subcategoryCode: "flyers",
        printerMaxWidthFeet: null,
      }),
    );
  });

  it("sends the integer feet on a tarpaulin save under the exact field name", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(200, { item: listing }));

    await saveListing(listing, { printerMaxWidthFeet: 7 });

    expect(sent(fetch).body).toEqual(expect.objectContaining({ printerMaxWidthFeet: 7 }));
    expect(JSON.stringify(sent(fetch).body)).not.toMatch(/milli/i);
  });
});

describe("opening one listing", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the listing GRIDGO answered with", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      answered(200, { item: { id: "sci_1", name: "Tarpaulin, 13oz", version: 7 } }),
    );

    const result = await loadListing("sci_1");

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.value.name).toBe("Tarpaulin, 13oz");
  });

  /**
   * The captain's report: "This listing is not reachable" on a `GET` that
   * answered 200. A parse miss used to be turned into a synthetic 404 and read
   * as a platform that had not shipped the board at all.
   */
  it("says the app is behind when GRIDGO answers with a shape it cannot read", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(answered(200, { item: { name: "no id" } }));

    const result = await loadListing("sci_1");

    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.message).toContain("Update GRIDGO Supplier");
  });

  /** Only a route that is genuinely absent means the board is not open. */
  it("keeps not-open-yet for a route this deployment does not have", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answered(404, { error: "not_found" }));

    expect(await loadListing("sci_1")).toEqual({ status: "not_open_yet" });
  });
});

describe("the production-time question on the wire", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("asks GRIDGO's preview for the proposed answer and two weeks of days", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(
      answered(200, {
        productionTime: { mode: "days", minDays: 1, maxDays: 3 },
        scheduling: { earliestReadyBy: "2026-10-24T05:00:00.000Z", securedReadyBy: "2026-10-27T05:00:00.000Z" },
        calendar: {
          days: [{ day: "2026-10-24", state: "tight", status: "tight", reason: null, readyBy: "2026-10-24T05:00:00.000Z" }],
          earliest: "2026-10-24T05:00:00.000Z",
        },
      }),
    );

    const result = await loadProductionTimePreview(listing, { mode: "days", minDays: 1, maxDays: 3 });

    const request = sent(fetch);
    expect(request.method).toBe("GET");
    expect(request.url).toMatch(
      /\/me\/catalog-items\/sci_1\/production-time-preview\?mode=days&minDays=1&maxDays=3&days=14$/,
    );
    expect(result.status === "ok" && result.value.days).toEqual([
      { day: "2026-10-24", status: "tight", reason: null, readyBy: new Date("2026-10-24T05:00:00.000Z"), rushTier: null },
    ]);
  });

  it("says one sentence when GRIDGO refuses the production time, whichever code it used", async () => {
    const message =
      "GRIDGO could not save this production time. Choose Same day with a number of hours, or Days with whole working days.";
    const choice = { productionTime: { mode: "same_day" as const, hours: 10 } };
    jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(400, { error: "invalid_production_time", field: "productionTime" }));
    expect(await saveListing(listing, choice)).toEqual({ status: "failed", message });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(answered(400, { error: "invalid_catalog_item", field: "turnaroundMinutes" }));
    expect(await saveListing(listing, choice)).toEqual({ status: "failed", message });
    // An older GRIDGO that names no field at all, as the dashboard reads it.
    jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(400, { error: "invalid_catalog_item" }));
    expect(await saveListing(listing, choice)).toEqual({ status: "failed", message });
    // A different field is a different problem.
    jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(400, { error: "invalid_catalog_item", field: "name" }));
    expect(await saveListing(listing, choice)).not.toEqual({ status: "failed", message });
  });

  it("says what each documented preview refusal means, before reading a 404 as a closed board", async () => {
    const choice = { mode: "days" as const, minDays: 1, maxDays: 3 };
    const cases: [number, string, string][] = [
      [404, "catalog_item_not_found", "This listing is no longer on your board, so there are no dates to show."],
      [
        409,
        "production_day_length_unavailable",
        "The dates cannot be worked out until every open day has the same hours. Pick one opening and closing time for all your open days.",
      ],
      [
        409,
        "shop_never_open",
        "GRIDGO could not fit this work into your open hours in the coming weeks. Check your open days and hours.",
      ],
      [400, "invalid_schedule", "GRIDGO could not read your shop hours. Set your open days and hours again, then try again."],
      [400, "invalid_production_time", "GRIDGO could not show dates for this time. Change it, then try again."],
    ];
    for (const [status, error, message] of cases) {
      jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(status, { error }));
      expect(await loadProductionTimePreview(listing, choice)).toEqual({ status: "failed", message });
    }
    // A bare 404 is a GRIDGO without the route.
    jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(404, {}));
    expect(await loadProductionTimePreview(listing, choice)).toEqual({ status: "not_open_yet" });
  });

  it("refuses to send a board it could not read whole", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(answered(200, { items: [{ id: "sci_1", version: 7 }, { id: "sci_2" }], total: 2 }));

    const result = await applyProductionTimeToAll({ mode: "days", minDays: 1, maxDays: 3 });

    expect(result).toEqual({
      status: "failed",
      message: "Some of your listings could not be read, so nothing was changed. Try again.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("counts the shop's listings for the question, or says nothing it cannot know", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(200, { items: [{ id: "sci_1", version: 7 }], total: 12, nextCursor: "c2" }));
    expect(await loadListingCount()).toBe(12);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(answered(200, { items: [{ id: "sci_1", version: 7 }], nextCursor: "c2" }));
    expect(await loadListingCount()).toBeNull();
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await loadListingCount()).toBeNull();
  });

  it("sends Same day as hours", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(answered(200, { calendar: { days: [] } }));
    await loadProductionTimePreview(listing, { mode: "same_day", minutes: 90 });
    expect(sent(fetch).url).toMatch(/\?mode=same_day&hours=1\.5&days=14$/);
  });

  it("names every listing and its version, hidden ones too, across pages", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        answered(200, { items: [{ id: "sci_1", version: 7, active: true }], total: 2, nextCursor: "c2" }),
      )
      .mockResolvedValueOnce(answered(200, { items: [{ id: "sci_2", version: 3, active: false }], total: 2 }))
      .mockResolvedValueOnce(answered(200, { items: [], total: 2 }));

    const result = await applyProductionTimeToAll({ mode: "same_day", minutes: 120 });

    expect(sent(fetch, 0).url).toMatch(/\/me\/catalog-items\?limit=50$/);
    expect(sent(fetch, 1).url).toMatch(/\/me\/catalog-items\?limit=50&cursor=c2$/);
    const apply = sent(fetch, 2);
    expect(apply.method).toBe("POST");
    expect(apply.url).toMatch(/\/me\/catalog-items\/production-time$/);
    expect(apply.body).toEqual({
      productionTime: { mode: "same_day", hours: 2 },
      expectedVersions: { sci_1: 7, sci_2: 3 },
    });
    expect(result).toEqual({ status: "ok", value: 2 });
  });

  it("reads the board again once when a listing moved in between, then says so plainly", async () => {
    const stale = answered(409, { error: "catalog_items_stale" });
    const page = answered(200, { items: [{ id: "sci_1", version: 7 }], total: 1 });
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(answered(200, { items: [{ id: "sci_1", version: 8 }], total: 1 }))
      .mockResolvedValueOnce(stale);

    const result = await applyProductionTimeToAll({ mode: "days", minDays: 1, maxDays: 2 });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sent(fetch, 3).body).toEqual(expect.objectContaining({ expectedVersions: { sci_1: 8 } }));
    expect(result).toEqual({
      status: "failed",
      message: "One of your listings changed while this was being applied, so nothing was changed. Try again.",
    });
  });
});
