import type { CatalogListQuery } from "@/lib/api";
import {
  boardBlockers,
  boardContextFor,
  subcategoryName,
  type Listing,
  type ServiceLine,
} from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

/**
 * What the shop is asking its board for, in one object.
 *
 * All four go to GRIDGO. None of them is a local `.filter` any more: the hunt
 * is ranked in PostgreSQL and the kind of work, the standing and the sort are
 * predicates beside it, so a page of eight is a page of eight over the wire.
 * Keeping them together is what makes "any change goes back to the first page"
 * one rule instead of four.
 */
export type BoardQuery = {
  /** What the shop typed. Blank is the whole board. */
  q: string;
  /** A subcategory code, or `all`. */
  kind: string;
  onBoard: OnBoardFilter;
  sort: CatalogueSort;
};

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

/** The resting board: everything the shop owns, in its own wall order. */
export const DEFAULT_BOARD_QUERY: BoardQuery = {
  q: "",
  kind: "all",
  onBoard: "all",
  sort: "board",
};

/** True once the shop has typed something worth hunting for. */
export function isHunting(query: BoardQuery): boolean {
  return query.q.trim().length > 0;
}

/**
 * How many standing filters are narrowing the board right now.
 *
 * The collapsed Filters chip carries this number, and that is the whole reason
 * it exists: a shop that hunts "tarp" with Hidden still selected finds nothing
 * and has no way to see why. A chip reading "Filters · 1" is that reason.
 */
export function narrowingCount(query: BoardQuery): number {
  let count = 0;
  if (query.kind !== "all") count += 1;
  if (query.onBoard !== "all") count += 1;
  if (query.sort !== "board") count += 1;
  return count;
}

/** The same question GRIDGO is asked, as query parameters. */
export function toListQuery(
  query: BoardQuery,
  cursor: string | null = null,
  pageSize = PAGE_SIZE,
): CatalogListQuery {
  return {
    q: query.q.trim() || null,
    sort: query.sort,
    subcategoryCode: query.kind === "all" ? null : query.kind,
    active: query.onBoard === "all" ? null : query.onBoard === "on_the_board",
    limit: pageSize,
    cursor,
  };
}

/**
 * GRIDGO's hunt is capped at 80 characters and answers `400` past it.
 *
 * Held on the phone rather than sent and refused: a shop typing a long line
 * should watch it stop, not watch the wall throw an error at it.
 */
export const MAX_HUNT_LENGTH = 80;

export function sortLabel(sort: CatalogueSort): string {
  return CATALOGUE_SORTS.find((entry) => entry.value === sort)?.label ?? "Default";
}

/**
 * Which of the board this page is, for the pager's own sentence.
 *
 * The pages come off GRIDGO's cursor, so the phone cannot slice its way to page
 * four — but it is told the total, and a total plus a page size is all "9–16 of
 * 40" needs. A shop that asked for pages should be able to say which one it is
 * looking at.
 */
export function pageWindow(
  page: number,
  total: number,
  pageSize = PAGE_SIZE,
): { from: number; to: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return {
    from: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, total),
    pageCount,
  };
}

/* --------------------------------------------------------------------------
   What an empty wall means

   Three different facts wear the same shape — no tiles — and telling them
   apart is the difference between a shop clearing its hunt and a shop
   believing its board is gone.
   -------------------------------------------------------------------------- */

/** The hunt found nothing. Directional, not apologetic. */
export const EMPTY_HUNT_SENTENCE =
  "Nothing on your board matches that. Clear the hunt, or put a new sample up.";

/** The standing filters found nothing, with no hunt running. */
export const EMPTY_CUT_SENTENCE =
  "Nothing matches that cut. Show all work, or switch the on-the-board toggle.";

/** What the skeleton says it is doing while a hunt is out. */
export const HUNTING_LABEL = "Hunting your board";

export function listingNeedsWork(listing: Listing, services: ServiceLine[]): boolean {
  return boardBlockers(listing, boardContextFor(listing, services)).length > 0;
}
