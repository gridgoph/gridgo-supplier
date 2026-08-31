import {
  DEFAULT_BOARD_QUERY,
  isHunting,
  kindsWithListings,
  narrowingCount,
  PAGE_SIZE,
  pageWindow,
  sortLabel,
  toListQuery,
} from "@/lib/catalogueBoard";
import type { Listing } from "@/lib/listings";

function listing(partial: Partial<Listing> & Pick<Listing, "id" | "name">): Listing {
  return {
    serviceLineId: "svc_1",
    subcategoryCode: "flyers",
    description: "Printed flyers.",
    basePriceMinor: 10000,
    pricingUnit: "per_package",
    packageQty: 100,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    turnaroundMode: "override",
    turnaroundHours: 48,
    fileFormatMode: "override",
    formatCodes: ["pdf"],
    onTheBoard: true,
    sortOrder: 0,
    photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
    groups: [],
    version: 1,
    updatedAt: null,
    ...partial,
  };
}

const tarp = listing({
  id: "a",
  name: "Tarpaulin",
  subcategoryCode: "tarpaulins_outdoor_banners",
  basePriceMinor: 45000,
  pricingUnit: "per_unit",
  packageQty: null,
  turnaroundHours: 24,
  sortOrder: 1,
});
const flyers = listing({
  id: "b",
  name: "Flyers 101",
  onTheBoard: false,
  sortOrder: 0,
});

describe("the question the shop asks its board", () => {
  it("lists each kind of work that has a listing", () => {
    const kinds = kindsWithListings([tarp, flyers], null);
    expect(kinds.map((entry) => entry.code).sort()).toEqual([
      "flyers",
      "tarpaulins_outdoor_banners",
    ]);
  });

  /**
   * The whole point of this slice: the hunt, the cut and the sort are GRIDGO's
   * predicates, so they must leave this app as query parameters and nothing
   * else. A default that quietly sent `active=true` would hide half a shop's
   * board and look like a platform bug.
   */
  it("sends the resting board as the shop's whole board", () => {
    expect(toListQuery(DEFAULT_BOARD_QUERY)).toEqual({
      q: null,
      sort: "board",
      subcategoryCode: null,
      active: null,
      limit: PAGE_SIZE,
      cursor: null,
    });
  });

  it("sends the hunt, the kind, the standing, the sort and the page", () => {
    expect(
      toListQuery(
        { q: "  gold foil ", kind: "flyers", onBoard: "hidden", sort: "price_low" },
        "cur_2",
      ),
    ).toEqual({
      q: "gold foil",
      sort: "price_low",
      subcategoryCode: "flyers",
      active: false,
      limit: PAGE_SIZE,
      cursor: "cur_2",
    });

    expect(toListQuery({ ...DEFAULT_BOARD_QUERY, onBoard: "on_the_board" }).active).toBe(true);
  });

  it("treats whitespace as no hunt at all", () => {
    expect(isHunting({ ...DEFAULT_BOARD_QUERY, q: "   " })).toBe(false);
    expect(isHunting({ ...DEFAULT_BOARD_QUERY, q: "tarp" })).toBe(true);
    expect(toListQuery({ ...DEFAULT_BOARD_QUERY, q: "   " }).q).toBeNull();
  });

  /**
   * The folded Filters chip carries this number, and it is the only thing that
   * explains a hunt finding nothing while Hidden is still selected.
   */
  it("counts the standing filters that are narrowing the board", () => {
    expect(narrowingCount(DEFAULT_BOARD_QUERY)).toBe(0);
    expect(narrowingCount({ ...DEFAULT_BOARD_QUERY, q: "tarp" })).toBe(0);
    expect(
      narrowingCount({ q: "tarp", kind: "flyers", onBoard: "hidden", sort: "name" }),
    ).toBe(3);
  });

  it("names the sort the way the sheet does", () => {
    expect(sortLabel("board")).toBe("Default");
    expect(sortLabel("price_low")).toBe("Price, low to high");
  });

  it("says which of the board a page is, from GRIDGO's own total", () => {
    expect(pageWindow(1, 40)).toEqual({ from: 1, to: 8, pageCount: 5 });
    expect(pageWindow(2, 40)).toEqual({ from: 9, to: 16, pageCount: 5 });
    expect(pageWindow(5, 36)).toEqual({ from: 33, to: 36, pageCount: 5 });
    // A hunt that found nothing has no window to describe.
    expect(pageWindow(1, 0)).toEqual({ from: 0, to: 0, pageCount: 1 });
  });
});
