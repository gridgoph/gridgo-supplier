/**
 * OSRM public routing for the rider-on-the-way map.
 *
 * Free, keyless, no SLA, rate-limited. Failure is normal and falls back to a
 * straight line — the map is something a shop glances at, and it must never
 * depend on a third party being up. Mirrors `lib/osrm.ts` in gridgo-client and
 * gridgo-rider: one map stack across the fleet (Leaflet + OpenStreetMap in a
 * WebView, OSRM for the line), no Google, no key.
 *
 * Path order is lon,lat. Getting it backwards drops Davao in the ocean.
 */

import { haversineMetres, isGeoPoint, toLonLat, type ApproachRoute, type GeoPoint, type LonLat } from "@/lib/riderApproach";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
/** Longer than this and the straight line is drawn instead. */
const ROUTE_TIMEOUT_MS = 8_000;

type OsrmRouteResponse = {
  code?: string;
  routes?: { distance: number; duration: number; geometry?: { coordinates?: LonLat[] } }[];
};

/** Parse an OSRM body, or null when it is unusable. */
export function parseOsrmResponse(data: OsrmRouteResponse): ApproachRoute | null {
  const route = data.code === "Ok" ? data.routes?.[0] : undefined;
  const coordinates = route?.geometry?.coordinates;
  if (!route || !coordinates || coordinates.length < 2) return null;
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return null;
  return { routed: true, distanceMetres: route.distance, durationSeconds: route.duration, coordinates };
}

export function fallbackRoute(from: GeoPoint, to: GeoPoint): ApproachRoute {
  return {
    routed: false,
    distanceMetres: haversineMetres(from, to),
    durationSeconds: 0,
    coordinates: [toLonLat(from), toLonLat(to)],
  };
}

/** Always resolves; a failed or refused request is the straight line. */
export async function fetchRoute(
  from: GeoPoint,
  to: GeoPoint,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<ApproachRoute> {
  if (!isGeoPoint(from) || !isGeoPoint(to)) return fallbackRoute(from, to);
  const [lon1, lat1] = toLonLat(from);
  const [lon2, lat2] = toLonLat(to);
  const url = `${OSRM_BASE}/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
  // The public server can hang rather than refuse; a line that never comes is worse than a straight one.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  options?.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await (options?.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return fallbackRoute(from, to);
    return parseOsrmResponse((await res.json()) as OsrmRouteResponse) ?? fallbackRoute(from, to);
  } catch {
    return fallbackRoute(from, to);
  } finally {
    clearTimeout(timer);
  }
}
