import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import type { RescheduleRequest } from "@/lib/api";
import { normalizeRescheduleRequests } from "@/lib/reschedule";
import { normalizeShopFailures, type ShopFailure } from "@/lib/shopRecovery";

/**
 * One part of the shop's record, as one of three outcomes. `not_open_yet` is a
 * deployment without the route: not a failure, and said quietly.
 */
export type RecordRead<T> = { status: "loaded"; value: T } | { status: "not_open_yet" } | { status: "failed" };

async function read<T>(load: () => Promise<unknown>, normalize: (body: unknown) => T | null): Promise<RecordRead<T>> {
  try {
    const value = normalize(await load());
    return value ? { status: "loaded", value } : { status: "not_open_yet" };
  } catch (error) {
    if (error instanceof api.ApiError && (error.status === 404 || error.status === 405)) {
      return { status: "not_open_yet" };
    }
    return { status: "failed" };
  }
}

export function loadShopFailures(): Promise<RecordRead<ShopFailure[]>> {
  return read(api.getMyShopFailures, normalizeShopFailures);
}

export function loadDeadlineRequests(): Promise<RecordRead<{ total: number; requests: RescheduleRequest[] }>> {
  return read(api.getMyRescheduleRequests, normalizeRescheduleRequests);
}

/** Keep the last good answer when a refresh fails, rather than blanking it. */
function keep<T>(previous: RecordRead<T> | null, next: RecordRead<T>): RecordRead<T> {
  return next.status === "failed" && previous?.status === "loaded" ? previous : next;
}

/**
 * The jobs this shop let go and the deadline requests it made — the two
 * parts of its record beside late production. Re-read on focus and whenever a
 * job moves.
 */
export function useShopRecord(): {
  failures: RecordRead<ShopFailure[]> | null;
  requests: RecordRead<{ total: number; requests: RescheduleRequest[] }> | null;
  reload: () => Promise<void>;
} {
  const [failures, setFailures] = useState<RecordRead<ShopFailure[]> | null>(null);
  const [requests, setRequests] = useState<RecordRead<{ total: number; requests: RescheduleRequest[] }> | null>(
    null,
  );
  const beginRead = useReadVersion();

  const reload = useCallback(async () => {
    const current = beginRead();
    const [nextFailures, nextRequests] = await Promise.all([loadShopFailures(), loadDeadlineRequests()]);
    if (!current()) return;
    setFailures((previous) => keep(previous, nextFailures));
    setRequests((previous) => keep(previous, nextRequests));
  }, [beginRead]);

  useLiveRefresh(["orders", "jobs"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { failures, requests, reload };
}
