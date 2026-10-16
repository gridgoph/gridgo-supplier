/**
 * The rider on the way to the shop (gridgo-supplier#148, report C2BE8E7A).
 *
 * While a job is `rider_assigned`, `GET /dispatch/:id/location` gives the shop
 * the rider's newest ping and the shop's own pick-up point. At pick-up GRIDGO
 * stops: the answer becomes `{ ping: null, hidden: "picked_up" }` and the map
 * goes away, because where the rider goes next is the client's business, not
 * the shop's. This module reads that answer and words it; it never keeps a
 * position the server has stopped sending.
 *
 * Everything shown is something the platform or the road router returned. The
 * arrival time is the one estimate, and the copy calls it one: it is a routing
 * engine's guess from the road distance, not anyone's promise.
 */

export type GeoPoint = { lat: number; lng: number };

export type RiderPing = GeoPoint & {
  /** When the rider's phone took the fix. */
  at: string;
  accuracy?: number | null;
};

/** GeoJSON / OSRM order. Convert only at the network and map boundary. */
export type LonLat = [number, number];

export type RiderApproach = {
  ping: RiderPing | null;
  /** The point the rider is driving to. */
  shop: GeoPoint | null;
  /** Set once GRIDGO has stopped sharing the position with the shop. */
  hidden: "picked_up" | null;
};

/** A position older than this is drawn faded and said to be old. */
export const APPROACH_STALE_MS = 3 * 60_000;
/** How often the job screen asks for a newer position while it is in front. */
export const APPROACH_POLL_MS = 12_000;
/** Closer than this, distance and minutes stop meaning anything. */
const ARRIVING_METRES = 150;
/**
 * Rough urban speed for a straight-line fallback, about 18 km/h. Only used
 * when the road router did not answer, and the copy then says so.
 */
const FALLBACK_METRES_PER_SECOND = 5;
/** A straight line understates a city route; this keeps the guess honest. */
const STRAIGHT_LINE_DETOUR = 1.3;

const EARTH_RADIUS_M = 6_371_000;

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function toLonLat(point: GeoPoint): LonLat {
  return [point.lng, point.lat];
}

export function haversineMetres(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Read the location answer defensively. Anything unrecognised is "no position". */
export function parseRiderApproach(raw: unknown): RiderApproach {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawPing = body.ping as Record<string, unknown> | null | undefined;
  const accuracy = rawPing?.accuracy;
  const at = typeof rawPing?.at === "string" && Number.isFinite(Date.parse(rawPing.at)) ? rawPing.at : null;
  const ping =
    rawPing && isGeoPoint(rawPing) && at
      ? {
          lat: rawPing.lat as number,
          lng: rawPing.lng as number,
          at,
          accuracy: typeof accuracy === "number" ? accuracy : null,
        }
      : null;
  const shop = isGeoPoint(body.shop) ? { lat: body.shop.lat, lng: body.shop.lng } : null;
  const hidden = body.hidden === "picked_up" ? "picked_up" : null;
  return { ping: hidden ? null : ping, shop, hidden };
}

/** "Just now", "20 s ago", "4 min ago", "2 h ago" — said as the age of a fix. */
export function locationAge(at: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${Math.floor(seconds / 5) * 5} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function isPingStale(at: string, now: number = Date.now()): boolean {
  return now - Date.parse(at) > APPROACH_STALE_MS;
}

/** "600 m", "2.4 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export type ApproachRoute = {
  /** True when the road router answered; false for the straight-line fallback. */
  routed: boolean;
  distanceMetres: number;
  durationSeconds: number;
  coordinates: LonLat[];
};

/** Whole minutes to the shop, never below one. */
export function roughMinutes(route: ApproachRoute): number {
  const seconds = route.routed
    ? route.durationSeconds
    : (route.distanceMetres * STRAIGHT_LINE_DETOUR) / FALLBACK_METRES_PER_SECOND;
  return Math.max(1, Math.round(seconds / 60));
}

export type ApproachTone = "info" | "warning" | "neutral";

export type ApproachReadout = {
  kind: "waiting" | "live" | "stale" | "arriving";
  /** The one sentence a shop reads first. */
  headline: string;
  /** Distance and how it was measured; null without a position. */
  distance: string | null;
  /** How fresh the position is, in words and as a chip. */
  freshness: { tone: ApproachTone; label: string; icon: "clock" | "triangle-alert" };
  /** What to do about it, when anything. */
  detail: string | null;
  /** Draw the rider faded. The words above carry the same fact. */
  faded: boolean;
};

/**
 * What the panel says, so the map caption, the chip and a screen reader never
 * disagree. `riderName` is the rider's first name when GRIDGO sent one.
 */
export function approachReadout({
  approach,
  route,
  riderName,
  now = Date.now(),
}: {
  approach: RiderApproach;
  route: ApproachRoute | null;
  riderName: string | null;
  now?: number;
}): ApproachReadout {
  const who = riderName || "The rider";
  const ping = approach.ping;

  if (!ping) {
    return {
      kind: "waiting",
      headline: `${who} has not shared a location yet`,
      distance: null,
      freshness: { tone: "neutral", label: "No location yet", icon: "clock" },
      detail: "It shows here once their phone sends it. Message them if you need to know where they are.",
      faded: false,
    };
  }

  const stale = isPingStale(ping.at, now);
  const age = locationAge(ping.at, now);
  const metres = route
    ? route.distanceMetres
    : approach.shop
      ? haversineMetres(ping, approach.shop)
      : null;
  const distance =
    metres == null
      ? null
      : route?.routed
        ? `${formatDistance(metres)} by road`
        : `${formatDistance(metres)} in a straight line`;

  if (stale) {
    return {
      kind: "stale",
      headline: `${who} was last seen ${age}`,
      distance,
      freshness: { tone: "warning", label: `Last seen ${age}`, icon: "triangle-alert" },
      detail: "Their phone has stopped sending a location, so the pin shows where they were. Message them to check.",
      faded: true,
    };
  }

  const freshness = { tone: "info" as const, label: `Updated ${age}`, icon: "clock" as const };

  if (metres != null && metres < ARRIVING_METRES) {
    return {
      kind: "arriving",
      headline: `${who} is almost at your shop`,
      distance,
      freshness,
      detail: "Have the package at the counter for the pickup checks.",
      faded: false,
    };
  }

  return {
    kind: "live",
    headline: route ? `${who} is about ${roughMinutes(route)} min away` : `${who} is on the way`,
    distance,
    freshness,
    detail: route ? "A rough guess from the road distance. Traffic can change it." : null,
    faded: false,
  };
}
