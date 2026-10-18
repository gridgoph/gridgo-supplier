import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { RecordRead } from "@/hooks/useShopRecord";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import { normalizePerformance, type Performance } from "@/lib/performance";

/** The shop's Performance, as one of three outcomes. A deployment without the route is `not_open_yet`. */
export async function loadPerformance(): Promise<RecordRead<Performance>> {
  try {
    const performance = normalizePerformance(await api.getMyPerformance());
    return performance ? { status: "loaded", value: performance } : { status: "not_open_yet" };
  } catch (error) {
    if (error instanceof api.ApiError && (error.status === 404 || error.status === 405 || error.status === 409)) {
      // 409 `performance_not_active`: the rollout marker is not effective yet.
      return { status: "not_open_yet" };
    }
    return { status: "failed" };
  }
}

/**
 * The shop's Performance, kept fresh.
 *
 * Re-read on focus, because a 30-day window and a Top Pick spell both expire
 * with time alone, and whenever a notice arrives or a job moves — GRIDGO
 * sends both with every new record. A failed read keeps the last answer.
 */
export function usePerformance(): { read: RecordRead<Performance> | null; reload: () => Promise<void> } {
  const [read, setRead] = useState<RecordRead<Performance> | null>(null);
  const beginRead = useReadVersion();

  const reload = useCallback(async () => {
    const current = beginRead();
    const next = await loadPerformance();
    if (!current()) return;
    setRead((previous) => (next.status === "failed" && previous?.status === "loaded" ? previous : next));
  }, [beginRead]);

  useLiveRefresh(["orders", "jobs", "notifications", "catalog"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { read, reload };
}
