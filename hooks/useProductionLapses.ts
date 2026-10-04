import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import { normalizeLapses, type ProductionLapse } from "@/lib/productionLapse";

export type LapsesRead =
  | { status: "loaded"; lapses: ProductionLapse[] }
  /** A deployment without late-production records. Not a failure, and nothing is shown. */
  | { status: "not_open_yet" }
  | { status: "failed" };

/** The shop's late-production records, as one of three outcomes. */
export async function loadProductionLapses(): Promise<LapsesRead> {
  try {
    const lapses = normalizeLapses(await api.getMyProductionLapses());
    return lapses ? { status: "loaded", lapses } : { status: "not_open_yet" };
  } catch (error) {
    if (error instanceof api.ApiError && (error.status === 404 || error.status === 405)) {
      return { status: "not_open_yet" };
    }
    return { status: "failed" };
  }
}

/**
 * The shop's late-production records, kept fresh.
 *
 * Re-read on focus and whenever a job or a payout moves: a warning and a
 * deduction both arrive as order invalidations. A failed read keeps the last
 * answer rather than blanking it.
 */
export function useProductionLapses(): {
  read: LapsesRead | null;
  lapses: ProductionLapse[] | null;
  reload: () => Promise<void>;
} {
  const [read, setRead] = useState<LapsesRead | null>(null);
  const beginRead = useReadVersion();

  const reload = useCallback(async () => {
    const current = beginRead();
    const next = await loadProductionLapses();
    if (!current()) return;
    setRead((previous) => (next.status === "failed" && previous?.status === "loaded" ? previous : next));
  }, [beginRead]);

  useLiveRefresh(["orders", "jobs", "payouts"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { read, lapses: read?.status === "loaded" ? read.lapses : null, reload };
}
