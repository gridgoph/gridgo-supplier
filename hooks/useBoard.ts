import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";
import { loadBoard, loadListing } from "@/lib/listingsApi";
import type { Listing } from "@/lib/listings";
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

export type BoardData = {
  listings: Listing[];
  catalog: ServiceCatalog | null;
  services: api.SupplierService[];
  loading: boolean;
  /** True while GRIDGO has no board routes on this deployment. */
  notOpenYet: boolean;
  /** A real failure, in a sentence. Null when there is nothing wrong. */
  error: string | null;
  /** True once a load has finished, so a refresh does not blank the screen. */
  loaded: boolean;
  reload: () => Promise<void>;
};

export function useBoard(): BoardData {
  const [listings, setListings] = useState<Listing[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [services, setServices] = useState<api.SupplierService[]>([]);
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
        api.listSupplierServices().catch(() => [] as api.SupplierService[]),
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

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { listings, catalog, services, loading, loaded, notOpenYet, error, reload };
}

export type ListingData = {
  listing: Listing | null;
  catalog: ServiceCatalog | null;
  services: api.SupplierService[];
  loading: boolean;
  notOpenYet: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * One listing, for the editor.
 *
 * Deliberately loaded on mount rather than on every focus: this screen holds
 * edits a shop has typed and not yet saved, and refetching under them on the
 * way back from the photo screen would throw the words away. Every write
 * reloads explicitly, so what is on screen is still what GRIDGO kept.
 */
export function useListing(itemId: string): ListingData {
  const [listing, setListing] = useState<Listing | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [services, setServices] = useState<api.SupplierService[]>([]);
  const [loading, setLoading] = useState(true);
  const [notOpenYet, setNotOpenYet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [result, taxonomy, lines] = await Promise.all([
        loadListing(itemId),
        api.getTaxonomy().catch(() => null),
        api.listSupplierServices().catch(() => [] as api.SupplierService[]),
      ]);

      if (taxonomy) setCatalog(buildCatalog(taxonomy));
      setServices(lines);

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

  useEffect(() => {
    void reload();
  }, [reload]);

  return { listing, catalog, services, loading, notOpenYet, error, reload };
}
