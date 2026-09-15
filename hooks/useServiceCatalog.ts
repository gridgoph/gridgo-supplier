import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { buildCatalog, type ServiceCatalog } from "@/lib/taxonomy";

/**
 * The catalogue a shop picks from, and the lines it already holds.
 *
 * Both come from GRIDGO in one pass — the catalogue from `GET /taxonomy` and
 * the shop's own accreditation lines from `GET /supplier-services` — because a
 * service means nothing without knowing whether this shop already offers it.
 */
export function useServiceCatalog() {
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [services, setServices] = useState<api.SupplierService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nextRead = useReadVersion();
  const reload = useCallback(async () => {
    const current = nextRead();
    setLoading(true);
    try {
      const [taxonomy, lines] = await Promise.all([
        api.getTaxonomy(),
        api.listSupplierServices(),
      ]);
      if (!current()) return;
      setCatalog(buildCatalog(taxonomy));
      setServices(lines);
      setError(null);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load the GRIDGO catalogue")));
    } finally {
      if (current()) setLoading(false);
    }
  }, [nextRead]);

  useLiveRefresh(["catalog", "services"], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { catalog, services, setServices, loading, error, reload };
}
