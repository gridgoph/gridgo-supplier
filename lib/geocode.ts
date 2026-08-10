/**
 * Turning a place into a point, and a point back into an address.
 *
 * GRIDGO has no Google key and is not getting one, so this is Nominatim —
 * OpenStreetMap's own geocoder, free and keyless, and the only search that is
 * consistent with the tiles the map already draws.
 *
 * Nominatim is a donated service with a usage policy this module exists to
 * keep, because a screen calling `fetch` directly cannot:
 *
 * - **At most one request a second, from one place.** Every call goes through
 *   the same serialised gate below, so two screens cannot double the rate.
 * - **No search-as-you-type.** The policy forbids autocomplete outright, so a
 *   shop searches by pressing search — never by typing. `lib/geocode` will not
 *   help you build the other thing; there is no per-keystroke entry point.
 * - **An identifying User-Agent.** A stock library agent is explicitly not
 *   enough. Browsers refuse to let a page set one, and send a Referer instead,
 *   which the policy accepts.
 * - **Cache results.** Repeating the same query is what gets a client blocked,
 *   so answers are remembered for the life of the screen.
 *
 * Attribution is a licence condition and is carried by the map document.
 */

export type GeocodePlace = {
  /** Stable enough to key a list on within one set of results. */
  id: string;
  lat: number;
  lng: number;
  /** Short enough to read on a row. */
  label: string;
  /** The whole address, for the line under it. */
  detail: string;
};

export type GeocodeFailure = "offline" | "unavailable" | "too_fast";

export type GeocodeResult<T> = { ok: true; value: T } | { ok: false; reason: GeocodeFailure };

const BASE = "https://nominatim.openstreetmap.org";

/**
 * A genuine identifier, per the policy. If this app is ever forked, change it —
 * an agent that names someone else's build is worse than a stock one.
 */
export const USER_AGENT = "GRIDGO-Supplier/1.0 (Davao City print marketplace pilot)";

/** The policy's floor is one second. The extra 200ms is for clock jitter. */
export const MIN_REQUEST_INTERVAL_MS = 1200;

/** Search is biased to Davao City; a shop pinning Manila is a mistake, not a feature. */
const DAVAO_VIEWBOX = "125.30,7.35,125.75,6.90";

export function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    countrycodes: "ph",
    viewbox: DAVAO_VIEWBOX,
    bounded: "0",
  });
  return `${BASE}/search?${params.toString()}`;
}

export function buildReverseUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
  });
  return `${BASE}/reverse?${params.toString()}`;
}

/**
 * Nominatim answers with the whole administrative chain — street, barangay,
 * city, region, postcode, country. A shop recognises the first two or three of
 * those and nothing after them, and the country is never in question here.
 */
export function shortenPlaceLabel(displayName: string): string {
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "Philippines" && !/^\d{4}$/.test(part));
  return parts.slice(0, 3).join(", ") || displayName.trim();
}

/** A query worth spending a request on. Two characters is a typo, not a search. */
export function isSearchable(query: string): boolean {
  return query.trim().length >= 3;
}

type RawPlace = {
  place_id?: number | string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
};

export function toPlaces(raw: unknown): GeocodePlace[] {
  if (!Array.isArray(raw)) return [];
  const out: GeocodePlace[] = [];
  for (const entry of raw as RawPlace[]) {
    const lat = Number(entry?.lat);
    const lng = Number(entry?.lon);
    const displayName = typeof entry?.display_name === "string" ? entry.display_name : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !displayName) continue;
    out.push({
      id: String(entry.place_id ?? entry.osm_id ?? `${lat},${lng}`),
      lat,
      lng,
      label: entry.name?.trim() || shortenPlaceLabel(displayName),
      detail: shortenPlaceLabel(displayName),
    });
  }
  return out;
}

/* --------------------------------------------------------------------------
   The gate

   One promise chain for the whole app, so however many screens ask, the
   requests still leave one at a time and no faster than the policy allows.
   -------------------------------------------------------------------------- */

let chain: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;

/** Test seam: lets a test drive the clock without waiting a real second. */
export function resetRateLimiterForTests(): void {
  chain = Promise.resolve();
  lastStartedAt = 0;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gated<T>(run: () => Promise<T>): Promise<T> {
  const mine = chain.then(async () => {
    const since = Date.now() - lastStartedAt;
    if (since < MIN_REQUEST_INTERVAL_MS) await wait(MIN_REQUEST_INTERVAL_MS - since);
    lastStartedAt = Date.now();
    return run();
  });
  // Keep the chain alive even when this request fails, or one network blip
  // would wedge every later search behind a rejected promise.
  chain = mine.catch(() => undefined);
  return mine;
}

async function fetchJson(url: string): Promise<GeocodeResult<unknown>> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Dropped by browsers, which send a Referer the policy accepts instead.
        "User-Agent": USER_AGENT,
      },
    });
    if (response.status === 429 || response.status === 403) {
      return { ok: false, reason: "too_fast" };
    }
    if (!response.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, value: (await response.json()) as unknown };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/* --------------------------------------------------------------------------
   Cache

   Same query, same answer, no second request — the policy names repeated
   identical queries as a reason clients get blocked.
   -------------------------------------------------------------------------- */

const searchCache = new Map<string, GeocodePlace[]>();
const reverseCache = new Map<string, string>();

/** ~11 m of precision, which is finer than a shop's own doorway. */
function reverseKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function clearGeocodeCaches(): void {
  searchCache.clear();
  reverseCache.clear();
}

/**
 * Search for a place by name.
 *
 * Call this from a submit, never from a keystroke — see the policy note above.
 */
export async function searchPlaces(query: string): Promise<GeocodeResult<GeocodePlace[]>> {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return { ok: true, value: cached };

  const result = await gated(() => fetchJson(buildSearchUrl(query.trim())));
  if (!result.ok) return result;

  const places = toPlaces(result.value);
  searchCache.set(key, places);
  return { ok: true, value: places };
}

/**
 * What a point is called. Used to fill the label under a pin the shop dropped,
 * which the shop can then correct — the label is a courtesy, the pin is the
 * thing GRIDGO measures from.
 */
export async function reverseLabel(
  lat: number,
  lng: number,
): Promise<GeocodeResult<string | null>> {
  const key = reverseKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached) return { ok: true, value: cached };

  const result = await gated(() => fetchJson(buildReverseUrl(lat, lng)));
  if (!result.ok) return result;

  const body = result.value as { display_name?: string } | null;
  const displayName = typeof body?.display_name === "string" ? body.display_name : "";
  if (!displayName) return { ok: true, value: null };

  const label = shortenPlaceLabel(displayName);
  reverseCache.set(key, label);
  return { ok: true, value: label };
}

/** What to tell a shop when the geocoder is not answering. Never a code. */
export function geocodeFailureMessage(reason: GeocodeFailure): string {
  switch (reason) {
    case "offline":
      return "Search could not reach the map service. You can still place your pin by tapping the map.";
    case "too_fast":
      return "The map service is busy. Wait a moment and search again, or tap the map to place your pin.";
    default:
      return "Search is not available right now. Tap the map to place your pin instead.";
  }
}
