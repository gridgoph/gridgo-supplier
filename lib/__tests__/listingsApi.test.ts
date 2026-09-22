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
