import {
  boardBlockers,
  boardContextFor,
  effectiveTurnaroundHours,
  fromPriceMinor,
  subcategoryName,
  type Listing,
  type ServiceLine,
} from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

export type OnBoardFilter = "all" | "on_the_board" | "hidden";
export type CatalogueSort = "board" | "name" | "price_low" | "price_high" | "fastest";

export const PAGE_SIZE = 8;

export const ON_BOARD_OPTIONS: readonly { value: OnBoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "on_the_board", label: "On the board" },
  { value: "hidden", label: "Hidden" },
];

export const CATALOGUE_SORTS: readonly {
  value: CatalogueSort;
  label: string;
  detail: string;
}[] = [
  { value: "board", label: "Default", detail: "The order they sit on the wall." },
  { value: "name", label: "Name", detail: "A to Z, the way a client would ask." },
  { value: "price_low", label: "Price, low to high", detail: "Cheapest quote first." },
  { value: "price_high", label: "Price, high to low", detail: "Highest quote first." },
  { value: "fastest", label: "Fastest first", detail: "Shortest ready-in at the top." },
];

export type KindOption = { code: string; name: string };

/** Kinds of work that actually have a listing, in the chart's names. */
export function kindsWithListings(
  listings: readonly Listing[],
  catalog: ServiceCatalog | null,
): KindOption[] {
  const seen = new Map<string, string>();
  for (const listing of listings) {
    const code = listing.subcategoryCode;
    if (!code || seen.has(code)) continue;
    seen.set(code, subcategoryName(catalog, code));
  }
  return [...seen.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function filterCatalogue(
  listings: readonly Listing[],
  kind: string,
  onBoard: OnBoardFilter,
): Listing[] {
  return listings.filter((listing) => {
    if (kind !== "all" && listing.subcategoryCode !== kind) return false;
    if (onBoard === "on_the_board") return listing.onTheBoard;
    if (onBoard === "hidden") return !listing.onTheBoard;
    return true;
  });
}

export function sortCatalogue(
  listings: readonly Listing[],
  sort: CatalogueSort,
  services: ServiceLine[],
): Listing[] {
  const copy = [...listings];
  if (sort === "board") {
    return copy.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  if (sort === "name") {
    return copy.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
    );
  }
  if (sort === "price_low" || sort === "price_high") {
    const dir = sort === "price_low" ? 1 : -1;
    return copy.sort((a, b) => dir * (fromPriceMinor(a) - fromPriceMinor(b)));
  }
  return copy.sort((a, b) => {
    const aHours = effectiveTurnaroundHours(a, boardContextFor(a, services).inheritedTurnaroundHours);
    const bHours = effectiveTurnaroundHours(b, boardContextFor(b, services).inheritedTurnaroundHours);
    if (aHours == null && bHours == null) return 0;
    if (aHours == null) return 1;
    if (bHours == null) return -1;
    return aHours - bHours;
  });
}

export function sortLabel(sort: CatalogueSort): string {
  return CATALOGUE_SORTS.find((entry) => entry.value === sort)?.label ?? "Default";
}

export function paginate<T>(items: readonly T[], page: number, pageSize = PAGE_SIZE): {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
} {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total,
  };
}

export function listingNeedsWork(listing: Listing, services: ServiceLine[]): boolean {
  return boardBlockers(listing, boardContextFor(listing, services)).length > 0;
}
