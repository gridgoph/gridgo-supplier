import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";
import { loadBoard, loadBoardKinds, loadListing, loadPrepSteps } from "@/lib/listingsApi";
import {
  normalizeServiceLines,
  type Listing,
  type PrepStep,
  type ServiceLine,
} from "@/lib/listings";
import { buildCatalog, type ServiceCatalog } from "@/lib/taxonomy";

/**
 * The board, and the accreditation it hangs off.
 *
 * Three things arrive together because none of them means anything alone: the
 * listings, the shop's own service lines (which carry the turnaround and file
 * types a listing inherits), and the GRIDGO chart (which names the kind of work
 * a listing is filed under). Loading them separately would let the wall render
 * a listing that says "Ready-in not set" for a second because its line had not
 * arrived yet.
 *
 * `notOpenYet` is a first-class outcome, not an error — see `lib/listingsApi`.
 */

/** The shop's own lines, from the projection that carries accepted formats. */
export async function loadServiceLines(): Promise<ServiceLine[]> {
  try {
    return normalizeServiceLines(await api.listMyCatalogServices());
  } catch {
    return [];
  }
}

/**
 * A route parameter that is worth spending a request on.
 *
 * `useLocalSearchParams` hands back `string | string[] | undefined`, and it is
 * briefly undefined on the first render of a pushed screen. Fetching anyway
 * asks GRIDGO for `/me/catalog-items/undefined`, gets a 404, and reports the
 * board as closed — a platform failure invented by a render order.
 */
export function routeId(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof first === "string" ? first.trim() : "";
  return trimmed && trimmed !== "undefined" && trimmed !== "null" ? trimmed : null;
}

export type BoardData = {
  /** This page of the board, in the order GRIDGO ranked or sorted it. */
  listings: Listing[];
  /** Feed back as the cursor to ask for the page after this one. */
  nextCursor: string | null;
  /** How many listings match this question, across every page. */
  total: number;
  /**
   * One listing per kind of work the shop's board covers, for the picker.
   *
   * Kept apart from `listings` because a page of eight cannot name every kind
   * on a board of sixty — this accumulates, and never shrinks when a hunt cuts
   * the wall down to one tile.
   */
  kindSource: Listing[];
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  loading: boolean;
  /** True while what is on the wall answers an older question than this one. */
  stale: boolean;
  /** True while GRIDGO has no board routes on this deployment. */
  notOpenYet: boolean;
  /** A real failure, in a sentence. Null when there is nothing wrong. */
  error: string | null;
  /** True once a load has finished, so a refresh does not blank the screen. */
  loaded: boolean;
  reload: () => Promise<void>;
  /** Take one listing off the local wall immediately. */
  dropListing: (id: string) => void;
};

/**
 * The board, one page at a time, for the question the shop is asking.
 *
 * `query` is a GRIDGO query, not a hint: the hunt, the kind of work, the
 * standing and the sort are all predicates in PostgreSQL, so changing any of
 * them is a new request rather than a new `.filter`. The hook re-reads whenever
 * that question changes and on every focus, and answers stale in-flight reads
 * by sequence — a shop typing "tarp" one letter at a time must not have "tar"
 * land last and win.
 */
export function useBoard(
  query: api.CatalogListQuery = {},
  options: { trackKinds?: boolean } = {},
): BoardData {
  const [listings, setListings] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [kindSource, setKindSource] = useState<Listing[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [notOpenYet, setNotOpenYet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);

  const signature = JSON.stringify(query);
  const latest = useRef(0);

  /** Remember every kind of work the shop has been seen to have a listing in. */
  const rememberKinds = useCallback((seen: readonly Listing[]) => {
    setKindSource((current) => {
      const known = new Set(current.map((item) => item.subcategoryCode));
      const added = seen.filter((item) => {
        if (!item.subcategoryCode || known.has(item.subcategoryCode)) return false;
        known.add(item.subcategoryCode);
        return true;
      });
      return added.length ? [...current, ...added] : current;
    });
  }, []);

  const reload = useCallback(async () => {
    const ticket = (latest.current += 1);
    setLoading(true);
    try {
      const [board, taxonomy, lines] = await Promise.all([
        loadBoard(JSON.parse(signature) as api.CatalogListQuery),
        api.getTaxonomy().catch(() => null),
        loadServiceLines(),
      ]);

      // A page the shop has already typed past must not overwrite the one it
      // is looking at.
      if (ticket !== latest.current) return;

      if (taxonomy) setCatalog(buildCatalog(taxonomy));
      setServices(lines);

      if (board.status === "ok") {
        setListings(board.value.listings);
        setNextCursor(board.value.nextCursor);
        setTotal(board.value.total);
        rememberKinds(board.value.listings);
        setNotOpenYet(false);
        setError(null);
      } else if (board.status === "not_open_yet") {
        setListings([]);
        setNextCursor(null);
        setTotal(0);
        setNotOpenYet(true);
        setError(null);
      } else {
        setNotOpenYet(false);
        setError(board.message);
      }
      setSettled(signature);
      setLoaded(true);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [rememberKinds, signature]);

  const dropListing = useCallback((id: string) => {
    setListings((current) => current.filter((item) => item.id !== id));
    setTotal((current) => Math.max(0, current - 1));
  }, []);

  useLiveRefresh(["catalog", "services", "availability"], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // One capped, unfiltered read so the kind-of-work picker can name kinds that
  // are not on this page. Once per screen, never on a keystroke, and only for
  // the screen that draws a picker.
  const probed = useRef(false);
  const { trackKinds = false } = options;
  useEffect(() => {
    if (!trackKinds || probed.current) return;
    probed.current = true;
    void loadBoardKinds().then(rememberKinds);
  }, [rememberKinds, trackKinds]);

  return {
    listings,
    nextCursor,
    total,
    kindSource,
    catalog,
    services,
    loading,
    stale: settled !== signature,
    loaded,
    notOpenYet,
    error,
    reload,
    dropListing,
  };
}

export type ListingData = {
  listing: Listing | null;
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  prepSteps: PrepStep[];
  /** False while GRIDGO has no prep-step routes on this deployment. */
  prepStepsOpen: boolean;
  loading: boolean;
  notOpenYet: boolean;
  error: string | null;
  reload: (preserveDraft?: boolean) => Promise<void>;
};

/**
 * One listing, for the editor.
 *
 * Reloading is deliberately conditional. The editor holds words and a price a
 * shop has typed and not yet saved, so refetching under them on the way back
 * from a sheet would throw them away — but coming back from the photo screen
 * with a stale zero-photo listing is exactly the bug that made a shop think its
 * samples had not saved. So `holdRefresh` is the screen's own answer to "am I
 * holding unsaved words?", checked on focus/live refresh and again when that
 * response arrives. Explicit reloads after local writes advance the baseline.
 */
export function useListing(
  itemId: string | null,
  holdRefresh?: () => boolean,
): ListingData {
  const [listing, setListing] = useState<Listing | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [prepSteps, setPrepSteps] = useState<PrepStep[]>([]);
  const [prepStepsOpen, setPrepStepsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notOpenYet, setNotOpenYet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hold = useRef(holdRefresh);
  useLayoutEffect(() => { hold.current = holdRefresh; }, [holdRefresh]);

  const nextRead = useReadVersion();
  const reload = useCallback(async (preserveDraft = false) => {
    const current = nextRead();
    if (!itemId) return;
    setLoading(true);
    try {
      const [result, taxonomy, lines, steps] = await Promise.all([
        loadListing(itemId),
        api.getTaxonomy().catch(() => null),
        loadServiceLines(),
        loadPrepSteps(itemId),
      ]);

      if (!current() || (preserveDraft && hold.current?.())) return;
      if (taxonomy) setCatalog(buildCatalog(taxonomy));
      setServices(lines);
      setPrepSteps(steps.status === "ok" ? steps.value : []);
      setPrepStepsOpen(steps.status !== "not_open_yet");

      if (result.status === "ok") {
        setListing(result.value);
        setNotOpenYet(false);
        setError(null);
      } else if (result.status === "not_open_yet") {
        setNotOpenYet(true);
        setError(null);
      } else {
        setNotOpenYet(false);
        setError(result.message);
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [itemId, nextRead]);

  useLiveRefresh(["catalog", "services"], () => { if (!hold.current?.()) return reload(true); });

  useFocusEffect(
    useCallback(() => {
      if (hold.current?.()) return;
      void reload(true);
    }, [reload]),
  );

  return {
    listing,
    catalog,
    services,
    prepSteps,
    prepStepsOpen,
    // An incomplete link has no request to wait for.
    loading: Boolean(itemId) && loading,
    notOpenYet,
    error,
    reload,
  };
}
