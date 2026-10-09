import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import * as api from "@/lib/api";
import type { OrderCall } from "@/lib/orderCall";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";

const RESOURCES = ["calls", "orders"] as const;

/**
 * This shop's calls on one job, for the missed-call notice. Read on focus and
 * whenever GRIDGO says the job's calls changed; a failed read keeps the last
 * answer, because a missing notice costs less than a red error on a job.
 */
export function useOrderCalls(orderId: string | undefined, enabled: boolean): OrderCall[] {
  const [calls, setCalls] = useState<OrderCall[]>([]);
  const begin = useReadVersion();

  const load = useCallback(async () => {
    if (!orderId || !enabled) {
      setCalls([]);
      return;
    }
    const current = begin();
    try {
      const next = await api.listCalls(orderId);
      if (current()) setCalls(next);
    } catch {
      // Keep what was read last.
    }
  }, [begin, enabled, orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useLiveRefresh(RESOURCES, load);
  return calls;
}
