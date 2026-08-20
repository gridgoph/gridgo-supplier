import {
  filterCatalogue,
  kindsWithListings,
  paginate,
  PAGE_SIZE,
  sortCatalogue,
  sortLabel,
} from "@/lib/catalogueBoard";
import type { Listing, ServiceLine } from "@/lib/listings";

function listing(partial: Partial<Listing> & Pick<Listing, "id" | "name">): Listing {
  return {
    serviceLineId: "svc_1",
    subcategoryCode: "flyers",
    description: "Printed flyers.",
    basePriceMinor: 10000,
    pricingUnit: "per_package",
    packageQty: 100,
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

const services: ServiceLine[] = [
  {
    id: "svc_1",
    categoryCode: "marketing_promotional",
    state: "live",
    turnaroundHours: 48,
    formatCodes: ["pdf"],
  },
];

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

describe("catalogue filter, sort and pages", () => {
  it("lists each kind of work that has a listing", () => {
    const kinds = kindsWithListings([tarp, flyers], null);
    expect(kinds.map((entry) => entry.code).sort()).toEqual([
      "flyers",
      "tarpaulins_outdoor_banners",
    ]);
  });

  it("keeps one kind of work, and on-the-board vs hidden", () => {
    expect(filterCatalogue([tarp, flyers], "flyers", "all").map((row) => row.id)).toEqual(["b"]);
    expect(filterCatalogue([tarp, flyers], "all", "on_the_board").map((row) => row.id)).toEqual(["a"]);
    expect(filterCatalogue([tarp, flyers], "all", "hidden").map((row) => row.id)).toEqual(["b"]);
  });

  it("sorts by the shop's own order, by name, by quote and by ready-in", () => {
    expect(sortCatalogue([tarp, flyers], "board", services).map((row) => row.id)).toEqual(["b", "a"]);
    expect(sortCatalogue([tarp, flyers], "name", services).map((row) => row.name)).toEqual([
      "Flyers 101",
      "Tarpaulin",
    ]);
    expect(sortLabel("board")).toBe("Default");
  });

  it("pages eight at a time and clamps a page that no longer exists", () => {
    const rows = Array.from({ length: 9 }, (_, i) => listing({ id: `n${i}`, name: `N${i}` }));
    const first = paginate(rows, 1);
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.pageCount).toBe(2);
    expect(paginate(rows, 2).items).toHaveLength(1);
    expect(paginate(rows, 99).page).toBe(2);
  });
});
