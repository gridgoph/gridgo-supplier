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
 *   the same serialised gate below, so two screens cannot double the rate. A
 *   lookup the shop has already moved past is dropped at the gate, before it
 *   spends a slot.
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
 * The search rules here (city boundary, query clean-up, one row per place,
 * precision) are the client app's drop-off search (gridgo-client#432), so a
 * shop and its clients are pinned by the same reading of the same map.
 */

/**
 * How exactly a search result pins the shop.
 *
 * - `exact`: a building, shop or door — the pin is where the rider goes.
 * - `street`: a whole road; the pin sits on one stretch of it.
 * - `area`: a barangay or district; the pin is its middle, nobody's door.
 */
export type PinPrecision = "exact" | "street" | "area";

export type GeocodePlace = {
  /** Stable enough to key a list on within one set of results. */
  id: string;
  lat: number;
  lng: number;
  /** Row title: the named place, or the street. */
  label: string;
  /**
   * Row's second line: the road and barangay that tell two same-named places
   * apart (three "Jollibee" rows used to read identically).
   */
  detail: string;
  /**
   * What goes into the shop's address field. Empty for a barangay: its
   * middle is nobody's door, so the address waits until the pin is moved.
   */
  address: string;
  precision: PinPrecision;
};

export type GeocodeFailure = "offline" | "unavailable" | "too_fast" | "slow" | "superseded";

export type GeocodeResult<T> = { ok: true; value: T } | { ok: false; reason: GeocodeFailure };

export type LookupOptions = {
  /**
   * Asked just before the request goes out. A lookup the shop has already
   * searched or dragged past is dropped there, so it never spends a slot of
   * Nominatim's one-request-a-second budget.
   */
  isCurrent?: () => boolean;
};

const BASE = "https://nominatim.openstreetmap.org";

/**
 * A genuine identifier, per the policy. If this app is ever forked, change it —
 * an agent that names someone else's build is worse than a stock one.
 */
export const USER_AGENT = "GRIDGO-Supplier/1.0 (Davao City print marketplace pilot)";

/** The policy's floor is one second. The extra 200ms is for clock jitter. */
export const MIN_REQUEST_INTERVAL_MS = 1200;

/** A lookup that has not answered in this long is given up on. */
export const GEOCODE_TIMEOUT_MS = 8000;

/** Rows shown under the search field. */
export const SEARCH_RESULT_LIMIT = 5;

/**
 * Davao City, as a box Nominatim can bound.
 *
 * The city's own OSM boundary box (6.956–7.606 N, 125.218–125.697 E) with a
 * little margin. The old box stopped at 7.35 N and 125.30 E, so a shop in
 * Marilog, Paquibato, or most of Baguio and Calinan districts could not be
 * searched for. A box is still a box — Samal and the towns round the city are
 * refused by name in `isDavaoCityHit`.
 */
export const DAVAO_BOX = { west: 125.21, south: 6.95, east: 125.71, north: 7.61 } as const;

export function pointInDavao(lat: number, lng: number): boolean {
  return (
    lat >= DAVAO_BOX.south && lat <= DAVAO_BOX.north && lng >= DAVAO_BOX.west && lng <= DAVAO_BOX.east
  );
}

/** `viewbox` is left,top,right,bottom = west,north,east,south. */
function viewbox(): string {
  return `${DAVAO_BOX.west},${DAVAO_BOX.north},${DAVAO_BOX.east},${DAVAO_BOX.south}`;
}

export function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    // More than are shown: a road split into several OSM ways comes back
    // several times, and the twins are folded into one row below.
    limit: "8",
    countrycodes: "ph",
    viewbox: viewbox(),
    // Inside the city only. A shop pinning a Manila street of the same name
    // is a mistake, not a feature.
    bounded: "1",
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

/**
 * Davao spellings Nominatim does not read.
 *
 * "Brgy." is how every Davao address is written and no OSM name carries it,
 * so "Brgy. Talomo" matched a radio studio before Talomo itself. Street
 * abbreviations are spelled out the way OSM names the road, and a trailing
 * ", Davao" or "Davao City" is dropped because the search is already bounded
 * to it. "Ateneo de Davao" keeps its Davao.
 */
export function normalizeQuery(raw: string): string {
  const original = raw.replace(/\s+/g, " ").trim();
  const q = original
    .replace(/\b(?:brgy|bgy|barangay)\b\.?\s*/gi, "")
    .replace(/\bblvd\b\.?/gi, "Boulevard")
    .replace(/\bave\b\.?/gi, "Avenue")
    .replace(/\bhwy\b\.?/gi, "Highway")
    .replace(/\brd\b\.?/gi, "Road")
    .replace(/\bnat'?l\b\.?/gi, "National")
    // "St." is Street after a name ("Bonifacio St."), Saint before one.
    .replace(/(\w)\s+st\b\.?(?=\s*(?:,|$))/gi, "$1 Street")
    .replace(/(?:,\s*davao(?:\s+city)?|\s+davao\s+city)(?:,?\s*philippines)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "");
  return q || original;
}

/**
 * The same search without the house or unit number in front.
 *
 * OSM in Davao has almost no house numbers, so "123 Quimpo Blvd" and
 * "Unit 4B, Abreeza Residences" often match nothing while the street or
 * building alone does. Null when there was no number to drop.
 */
export function withoutUnitNumber(query: string): string | null {
  const stripped = query
    .replace(/^(?:(?:unit|rm|room|blk|block|lot|phase|ph|bldg|door|apt)\.?\s*#?[\w-]+[,\s]*)+/i, "")
    .replace(/^#?\d+[a-z]?(?:[-/]\w+)?\b[,\s]*/i, "")
    .trim();
  if (!stripped || stripped === query) return null;
  return stripped;
}

type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  quarter?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  city?: string;
  town?: string;
  municipality?: string;
  city_district?: string;
  county?: string;
  building?: string;
  amenity?: string;
  shop?: string;
  tourism?: string;
  office?: string;
};

export type NominatimHit = {
  place_id?: number | string;
  osm_id?: number | string;
  lat?: string | number;
  lon?: string | number;
  display_name?: string;
  name?: string;
  /** jsonv2: the OSM key (`amenity`, `highway`, `boundary`, `place`…). */
  category?: string;
  type?: string;
  address?: NominatimAddress;
};

function firstText(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Inside Davao City by name, or — when OSM names no city — by the box.
 * Another town in the box (Samal, Panabo, Digos…) is refused.
 */
export function isDavaoCityHit(hit: NominatimHit, lat: number, lng: number): boolean {
  if (!pointInDavao(lat, lng)) return false;
  const addr = hit.address;
  const named = [addr?.city, addr?.town, addr?.municipality, addr?.city_district, addr?.county]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (named.includes("davao city")) return true;
  if (typeof hit.display_name === "string" && /davao city/i.test(hit.display_name)) return true;
  return !named;
}

const AREA_PLACES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "quarter",
  "neighbourhood",
  "city_district",
  "district",
  "county",
  "region",
  "state",
  "island",
  "locality",
  "isolated_dwelling",
]);

export function precisionOf(hit: NominatimHit): PinPrecision {
  const category = hit.category ?? "";
  const type = hit.type ?? "";
  // A business park or a subdivision is a place to look, not a door.
  if (category === "boundary" || category === "landuse") return "area";
  if (category === "place" && AREA_PLACES.has(type)) return "area";
  if (category === "highway") return "street";
  return "exact";
}

/**
 * Barangay a hit sits in. OSM in Davao files the barangay as `quarter` (or
 * `suburb`, `village`) and the district above it as `suburb` too, so a name
 * ending in "District" — Poblacion, Talomo — is used only when nothing finer
 * is there; nobody gives directions by district.
 */
export function barangayOf(hit: NominatimHit): string {
  const addr = hit.address ?? {};
  const candidates = [addr.quarter, addr.suburb, addr.village, addr.hamlet, addr.neighbourhood]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return candidates.find((name) => !/\bdistrict$/i.test(name)) ?? firstText(addr.suburb, addr.city_district);
}

/**
 * The street line a rider can use: house number + road, else a building or a
 * named place on its road, else the road. A barangay is not a street, so this
 * never invents one from it.
 */
export function streetLine(hit: NominatimHit): string {
  const addr = hit.address ?? {};
  const road = firstText(addr.road, addr.pedestrian, addr.footway);
  const house = firstText(addr.house_number);
  const named = firstText(addr.building, hit.name, addr.amenity, addr.shop, addr.tourism, addr.office);
  if (road && house) return `${house} ${road}`;
  // A road's own name is the road, not a place on it.
  if (named && road && named.toLowerCase() !== road.toLowerCase()) return `${named}, ${road}`;
  return firstText(road, named);
}

/** Street and barangay — the address a rider reads — with nothing said twice. */
export function addressOf(hit: NominatimHit): string {
  const street = streetLine(hit);
  if (!street) return "";
  const barangay = barangayOf(hit);
  if (!barangay || street.toLowerCase().includes(barangay.toLowerCase())) return street;
  return `${street}, ${barangay}`;
}

/** Road and barangay, skipping whatever the row's title already says. */
function areaOf(hit: NominatimHit, title: string): string {
  const addr = hit.address ?? {};
  const road = firstText(addr.road, addr.pedestrian, addr.footway);
  const said = title.trim().toLowerCase();
  const parts = [road, barangayOf(hit)].filter(
    (part, index, all) => part && part.toLowerCase() !== said && all.indexOf(part) === index,
  );
  return parts.length ? parts.join(", ") : "Davao City";
}

function placeFrom(hit: NominatimHit): GeocodePlace | null {
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isDavaoCityHit(hit, lat, lng)) return null;

  const precision = precisionOf(hit);
  const street = streetLine(hit);
  const displayName = typeof hit.display_name === "string" ? hit.display_name : "";
  const label = firstText(hit.name, street, displayName && shortenPlaceLabel(displayName));
  if (!label) return null;
  return {
    id: String(hit.place_id ?? hit.osm_id ?? `${lat},${lng}`),
    lat,
    lng,
    label,
    detail: areaOf(hit, label),
    address: precision === "area" ? "" : addressOf(hit),
    precision,
  };
}

function metresBetween(a: GeocodePlace, b: GeocodePlace): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
}

/**
 * One row per place. OSM splits a road into many ways, so "Quimpo Blvd" came
 * back as five identical rows; a road keeps one row per barangay, and a named
 * place one row per spot.
 */
export function distinctPlaces(places: GeocodePlace[]): GeocodePlace[] {
  const kept: GeocodePlace[] = [];
  for (const next of places) {
    const twin = kept.some((seen) => {
      if (seen.label.toLowerCase() !== next.label.toLowerCase()) return false;
      if (seen.detail.toLowerCase() === next.detail.toLowerCase()) return true;
      return metresBetween(seen, next) < 80;
    });
    if (!twin) kept.push(next);
  }
  return kept;
}

/** Search hits as rows: inside Davao City, one per place, at most five. */
export function toPlaces(raw: unknown): GeocodePlace[] {
  if (!Array.isArray(raw)) return [];
  const places: GeocodePlace[] = [];
  for (const entry of raw as NominatimHit[]) {
    const place = placeFrom(entry);
    if (place) places.push(place);
  }
  return distinctPlaces(places).slice(0, SEARCH_RESULT_LIMIT);
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

const SUPERSEDED: GeocodeResult<never> = { ok: false, reason: "superseded" };

async function gated<T>(
  run: () => Promise<GeocodeResult<T>>,
  isCurrent?: () => boolean,
): Promise<GeocodeResult<T>> {
  const mine = chain.then(async () => {
    if (isCurrent && !isCurrent()) return SUPERSEDED;
    const since = Date.now() - lastStartedAt;
    if (since < MIN_REQUEST_INTERVAL_MS) await wait(MIN_REQUEST_INTERVAL_MS - since);
    if (isCurrent && !isCurrent()) return SUPERSEDED;
    lastStartedAt = Date.now();
    return run();
  });
  // Keep the chain alive even when this request fails, or one network blip
  // would wedge every later search behind a rejected promise.
  chain = mine.catch(() => undefined);
  return mine;
}

/**
 * One GET, given up after `GEOCODE_TIMEOUT_MS`. Without the limit a dropped
 * mobile connection left the search spinning for good.
 */
async function fetchJson(url: string): Promise<GeocodeResult<unknown>> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, GEOCODE_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Dropped by browsers, which send a Referer the policy accepts instead.
        "User-Agent": USER_AGENT,
      },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (response.status === 429 || response.status === 403 || response.status === 503) {
      return { ok: false, reason: "too_fast" };
    }
    if (!response.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, value: (await response.json()) as unknown };
  } catch {
    return { ok: false, reason: timedOut ? "slow" : "offline" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------------
   Cache

   Same query, same answer, no second request — the policy names repeated
   identical queries as a reason clients get blocked.
   -------------------------------------------------------------------------- */

const searchCache = new Map<string, GeocodePlace[]>();
const reverseCache = new Map<string, PinAddress>();

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
 * A search that finds nothing is tried once more without a leading house or
 * unit number, which OSM in Davao almost never carries.
 */
export async function searchPlaces(
  query: string,
  options: LookupOptions = {},
): Promise<GeocodeResult<GeocodePlace[]>> {
  const first = normalizeQuery(query);
  const key = first.toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return { ok: true, value: cached };

  const attempts = [first];
  const fallback = withoutUnitNumber(first);
  if (fallback) attempts.push(fallback);

  let places: GeocodePlace[] = [];
  for (const q of attempts) {
    const result = await gated(() => fetchJson(buildSearchUrl(q)), options.isCurrent);
    if (!result.ok) return result;
    places = toPlaces(result.value);
    if (places.length) break;
  }
  searchCache.set(key, places);
  return { ok: true, value: places };
}

export type PinAddress = {
  /** Street and barangay, or null where OSM names no street here. */
  address: string | null;
  /** False when the point is in another town (Samal sits inside the box). */
  inDavao: boolean;
};

/**
 * What a point is: the address that fills the field under a pin the shop
 * dropped, which the shop can then correct — the address is a courtesy, the
 * pin is what GRIDGO measures from.
 */
export async function reverseAddress(
  lat: number,
  lng: number,
  options: LookupOptions = {},
): Promise<GeocodeResult<PinAddress>> {
  const key = reverseKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached) return { ok: true, value: cached };

  const result = await gated(() => fetchJson(buildReverseUrl(lat, lng)), options.isCurrent);
  if (!result.ok) return result;

  const body = result.value as NominatimHit | null;
  const hit = body && typeof body === "object" ? body : {};
  const value: PinAddress = {
    address: addressOf(hit) || null,
    inDavao: isDavaoCityHit(hit, lat, lng),
  };
  reverseCache.set(key, value);
  return { ok: true, value };
}

/** What to tell a shop when the geocoder is not answering. Never a code. */
export function geocodeFailureMessage(reason: GeocodeFailure): string {
  switch (reason) {
    case "offline":
      return "Map search needs the internet. Check your connection, or tap your shop on the map.";
    case "too_fast":
      return "Map search is busy. Wait a few seconds and search again, or tap the map.";
    case "slow":
      return "Map search is taking too long. Search again, or tap the map.";
    default:
      return "Map search is not working right now. Tap your shop on the map instead.";
  }
}
