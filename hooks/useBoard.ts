import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";
import { loadBoard, loadListing, loadPrepSteps } from "@/lib/listingsApi";
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
  listings: Listing[];
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  loading: boolean;
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

export function useBoard(): BoardData {
  const [listings, setListings] = useState<Listing[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [notOpenYet, setNotOpenYet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [board, taxonomy, lines] = await Promise.all([
        loadBoard(),
        api.getTaxonomy().catch(() => null),
        loadServiceLines(),
      ]);

      if (taxonomy) setCatalog(buildCatalog(taxonomy));
      setServices(lines);

      if (board.status === "ok") {
        setListings(board.value);
        setNotOpenYet(false);
        setError(null);
      } else if (board.status === "not_open_yet") {
        setListings([]);
        setNotOpenYet(true);
        setError(null);
      } else {
        setNotOpenYet(false);
        setError(board.message);
      }
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const dropListing = useCallback((id: string) => {
    setListings((current) => current.filter((item) => item.id !== id));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return {
    listings,
    catalog,
    services,
    loading,
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
  reload: () => Promise<void>;
};

/**
 * One listing, for the editor.
 *
 * Reloading is deliberately conditional. The editor holds words and a price a
 * shop has typed and not yet saved, so refetching under them on the way back
 * from a sheet would throw them away — but coming back from the photo screen
 * with a stale zero-photo listing is exactly the bug that made a shop think its
 * samples had not saved. So `holdRefresh` is the screen's own answer to "am I
 * holding unsaved words?", checked on every focus, and every write calls
 * `reload` outright.
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
  hold.current = holdRefresh;

  const reload = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const [result, taxonomy, lines, steps] = await Promise.all([
        loadListing(itemId),
        api.getTaxonomy().catch(() => null),
        loadServiceLines(),
        loadPrepSteps(itemId),
      ]);

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
      setLoading(false);
    }
  }, [itemId]);

  useFocusEffect(
    useCallback(() => {
      if (hold.current?.()) return;
      void reload();
    }, [reload]),
  );

  // A screen opened with no usable id has nothing to wait for, and saying so is
  // better than a skeleton that never resolves.
  useEffect(() => {
    if (!itemId) setLoading(false);
  }, [itemId]);

  return {
    listing,
    catalog,
    services,
    prepSteps,
    prepStepsOpen,
    loading,
    notOpenYet,
    error,
    reload,
  };
}
