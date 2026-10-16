import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import { fetchRoute } from "@/lib/osrm";
import {
  APPROACH_POLL_MS,
  haversineMetres,
  type ApproachRoute,
  type GeoPoint,
  type RiderApproach,
} from "@/lib/riderApproach";

/** The rider has to move this far before the road route is asked for again. */
const REROUTE_METRES = 60;

export type RiderApproachState = {
  /** Null until the first answer. */
  approach: RiderApproach | null;
  route: ApproachRoute | null;
  /** The last poll failed; what is shown is the last answer that arrived. */
  failed: boolean;
  /** GRIDGO does not share a position with this shop (older API, or not allowed). */
  unavailable: boolean;
};

/**
 * Polls `GET /dispatch/:id/location` while the job screen is in front and the
 * rider is on the way, and stops the moment it is not — a phone in a pocket
 * should not keep asking. The road route is asked for only when the rider has
 * actually moved, so a shop watching for ten minutes costs OSRM a handful of
 * requests rather than one per poll.
 *
 * When GRIDGO says the job was picked up, `onPickedUp` lets the screen re-read
 * the job, and the map goes with the state.
 */
export function useRiderApproach(
  orderId: string,
  { enabled, onPickedUp }: { enabled: boolean; onPickedUp?: () => void },
): RiderApproachState {
  const [approach, setApproach] = useState<RiderApproach | null>(null);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [route, setRoute] = useState<ApproachRoute | null>(null);
  const sequence = useRef(0);
  const pickedUp = useRef(onPickedUp);
  useEffect(() => {
    pickedUp.current = onPickedUp;
  }, [onPickedUp]);

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await api.getRiderApproach(orderId);
      if (current !== sequence.current) return;
      setApproach(next);
      setFailed(false);
      setUnavailable(false);
      if (next.hidden === "picked_up") pickedUp.current?.();
    } catch (error) {
      if (current !== sequence.current) return;
      // A deployment without the route, or a shop it is not shared with: say nothing.
      if (error instanceof ApiError && [403, 404, 405].includes(error.status)) setUnavailable(true);
      else setFailed(true);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void refresh();
      const timer = setInterval(() => void refresh(), APPROACH_POLL_MS);
      return () => {
        sequence.current++;
        clearInterval(timer);
      };
    }, [enabled, refresh]),
  );

  const rider: GeoPoint | null = approach?.ping ?? null;
  const shop: GeoPoint | null = approach?.shop ?? null;
  const routedFrom = useRef<{ from: GeoPoint; to: GeoPoint } | null>(null);
  const routeSequence = useRef(0);

  useEffect(() => {
    if (!rider || !shop) return;
    const last = routedFrom.current;
    if (
      last &&
      last.to.lat === shop.lat &&
      last.to.lng === shop.lng &&
      haversineMetres(last.from, rider) < REROUTE_METRES
    ) {
      return;
    }
    routedFrom.current = { from: rider, to: shop };
    const current = ++routeSequence.current;
    void fetchRoute(rider, shop).then((answer) => {
      if (current === routeSequence.current) setRoute(answer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the coordinates, not the objects
  }, [rider?.lat, rider?.lng, shop?.lat, shop?.lng]);

  return {
    approach,
    // No position, no line: a route left behind a hidden rider would still say where they were.
    route: rider && shop ? route : null,
    failed,
    unavailable,
  };
}
