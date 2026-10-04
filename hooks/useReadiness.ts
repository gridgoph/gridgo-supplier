import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import { normalizeReadiness, type Readiness } from "@/lib/readiness";

/** GRIDGO's readiness, or `null` when it is unknown on this deployment. */
export async function loadReadiness(): Promise<Readiness | null> {
  try {
    return normalizeReadiness(await api.getSupplierReadiness());
  } catch {
    // A diagnostic, never a screen of its own: an absent route, an older API
    // or a dropped connection all fall back to what the screen drew before.
    return null;
  }
}

/**
 * Whether clients can be matched with this shop, kept fresh.
 *
 * Re-read on focus and whenever anything it is computed from moves — a
 * listing, a service line, approval, the shop's own details or its hours.
 * A failed read keeps the last answer rather than blanking it.
 */
export function useReadiness(): { readiness: Readiness | null; reload: () => Promise<void> } {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const beginRead = useReadVersion();

  const reload = useCallback(async () => {
    const current = beginRead();
    const next = await loadReadiness();
    if (!current()) return;
    if (next) setReadiness(next);
  }, [beginRead]);

  useLiveRefresh(["catalog", "services", "identity", "approvals", "availability"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { readiness, reload };
}
