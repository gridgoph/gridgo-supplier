/**
 * The phone's own position, asked for only when the shop taps
 * **Use my location** on its shop pin.
 *
 * Ported from gridgo-client's `lib/deviceLocation.ts` (PR 432) so a pin set
 * by GPS behaves the same in both apps: a satellite fix first, the network's
 * rougher one after `PRECISE_FIX_TIMEOUT_MS`, and the phone's own error radius
 * reported so the map can draw it. This app adds what the shop can actually
 * do about each failure — a refusal it can still change, one only Settings
 * can change, and location switched off — because "it did not work" is not a
 * next step.
 *
 * Foreground and while-in-use only. Nothing here starts a watch or asks for
 * background location, and a pin GRIDGO did not measure is never invented:
 * every failure returns words and no point.
 *
 * `expo-location` is required lazily and probed first, so an APK built before
 * the module was added says so instead of crashing the screen.
 */

import { Platform } from "react-native";

export type GeoPoint = { lat: number; lng: number };

/** How long a satellite fix may take before the network's rougher one is used. */
export const PRECISE_FIX_TIMEOUT_MS = 10000;

/**
 * How long the network's fallback reading may take. Without a bound, a phone
 * whose location provider never answers left "Finding you…" up for good.
 */
export const FALLBACK_FIX_TIMEOUT_MS = 10000;

/** Above this, a phone's fix is a neighbourhood, not a door. Same as the client. */
export const ROUGH_FIX_METERS = 30;

export const LOCATION_DENIED =
  "GRIDGO was not allowed to use this phone's location. Tap Try again to allow it, or search for your street or tap the map.";

export const LOCATION_BLOCKED =
  "Location is turned off for GRIDGO in this phone's settings. Allow it there, or search for your street or tap the map.";

export const LOCATION_BROWSER_BLOCKED =
  "This browser is not sharing its location with GRIDGO. Allow it in the browser, or search for your street or tap the map.";

export const LOCATION_SERVICES_OFF =
  "This phone's location is switched off. Turn it on, then tap Try again — or search for your street or tap the map.";

export const LOCATION_UNAVAILABLE =
  "This phone could not find where it is. Step outside or near a window and tap Try again, or search for your street or tap the map.";

export const LOCATION_TIMED_OUT =
  "This phone took too long to find where it is. Step outside or near a window and tap Try again, or search for your street or tap the map.";

export const LOCATION_NEEDS_REBUILD =
  "Use my location needs the newest GRIDGO app on this phone. Search for your street, or tap the map.";

export const LOCATION_OUTSIDE_DAVAO =
  "This phone is outside Davao City, so it cannot place your shop. Search for your street, or tap the map.";

/**
 * What the shop can do next. `retry` asks again; `settings` sends it to the
 * phone's settings, because Android and iOS will not show the prompt again.
 */
export type LocationRemedy = "retry" | "settings" | "none";

export type DeviceLocationResult =
  | {
      status: "ok";
      point: GeoPoint;
      /** The phone's own error radius in whole metres, when it reports one. */
      accuracyMeters?: number;
    }
  | {
      status: "denied" | "blocked" | "services_off" | "unavailable" | "timed_out" | "needs_rebuild";
      message: string;
      remedy: LocationRemedy;
    };

type Reading = { coords?: { latitude: number; longitude: number; accuracy?: number | null } } | null;

type Permission = { granted: boolean; canAskAgain?: boolean };

/** The slice of `expo-location` this file uses, so tests can stand it in. */
export type LocationModule = {
  Accuracy?: { Highest?: number; High?: number; Balanced?: number; Low?: number };
  hasServicesEnabledAsync?: () => Promise<boolean>;
  requestForegroundPermissionsAsync: () => Promise<Permission>;
  getCurrentPositionAsync: (options: { accuracy?: number }) => Promise<Reading>;
};

let cached: LocationModule | null | undefined;

function inJest(): boolean {
  return typeof process !== "undefined" && Boolean(process.env.JEST_WORKER_ID);
}

function loadLocation(): LocationModule | null {
  if (cached !== undefined) return cached;
  try {
    if (!inJest()) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requireOptionalNativeModule } = require("expo-modules-core") as {
        requireOptionalNativeModule: (name: string) => unknown;
      };
      if (!requireOptionalNativeModule("ExpoLocation")) {
        cached = null;
        return null;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-location") as LocationModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Tests only: forget the probe, or hand in a stand-in module (`null` = absent). */
export function setLocationModuleForTests(module: LocationModule | null | undefined): void {
  cached = module;
}

function failure(status: Exclude<DeviceLocationResult["status"], "ok">): DeviceLocationResult {
  switch (status) {
    case "denied":
      return { status, message: LOCATION_DENIED, remedy: "retry" };
    case "blocked":
      return { status, message: LOCATION_BLOCKED, remedy: "settings" };
    case "services_off":
      return { status, message: LOCATION_SERVICES_OFF, remedy: "retry" };
    case "timed_out":
      return { status, message: LOCATION_TIMED_OUT, remedy: "retry" };
    case "needs_rebuild":
      return { status, message: LOCATION_NEEDS_REBUILD, remedy: "none" };
    default:
      return { status: "unavailable", message: LOCATION_UNAVAILABLE, remedy: "retry" };
  }
}

function pointFrom(coords: { latitude: number; longitude: number } | undefined): GeoPoint | null {
  if (!coords) return null;
  const { latitude: lat, longitude: lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function resultFrom(reading: Reading): DeviceLocationResult | null {
  const point = pointFrom(reading?.coords);
  if (!point) return null;
  const accuracy = reading?.coords?.accuracy;
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0
    ? { status: "ok", point, accuracyMeters: Math.round(accuracy) }
    : { status: "ok", point };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** True when the thrown error is Expo's "location services are off". */
function isServicesOff(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "E_LOCATION_SERVICES_DISABLED" || code === "ERR_LOCATION_SERVICES_DISABLED";
}

/**
 * A satellite fix first, because every delivery fee is measured from this
 * pin: the Balanced reading is the cell/Wi-Fi guess, often 100 m or more off.
 * Indoors a satellite fix can take a long time, so after the timeout the
 * rougher reading is used and its radius says how rough it is.
 */
async function readPosition(Location: LocationModule): Promise<DeviceLocationResult> {
  const precise = Location.Accuracy?.Highest ?? Location.Accuracy?.High;
  const rough = Location.Accuracy?.Balanced ?? Location.Accuracy?.Low ?? 3;
  if (precise != null) {
    try {
      const reading = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: precise }),
        PRECISE_FIX_TIMEOUT_MS,
      );
      const result = resultFrom(reading);
      if (result) return result;
    } catch (error) {
      if (isServicesOff(error)) return failure("services_off");
      // Fall back to the rougher reading below.
    }
  }
  try {
    // Bounded too: the whole read now ends within both timeouts, with a
    // sentence and Try again rather than a spinner that never stops.
    const reading = await withTimeout(Location.getCurrentPositionAsync({ accuracy: rough }), FALLBACK_FIX_TIMEOUT_MS);
    if (reading === null) return failure("timed_out");
    return resultFrom(reading) ?? failure("unavailable");
  } catch (error) {
    return failure(isServicesOff(error) ? "services_off" : "unavailable");
  }
}

type BrowserGeolocation = {
  getCurrentPosition: (
    ok: (position: { coords: { latitude: number; longitude: number; accuracy?: number } }) => void,
    fail: (error: { code: number }) => void,
    options: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
  ) => void;
};

function browserGeolocation(): BrowserGeolocation | null {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return null;
  return (navigator as unknown as { geolocation?: BrowserGeolocation }).geolocation ?? null;
}

/** True when this runtime can try at all — the control is not drawn otherwise. */
export function canUseDeviceLocation(): boolean {
  if (Platform.OS === "web") return browserGeolocation() != null;
  return true;
}

/**
 * The web build asks the browser; its own prompt is the permission ask, raised
 * only by the tap. Code 1 is a refusal, which only the browser can undo.
 */
function readBrowserPosition(geo: BrowserGeolocation): Promise<DeviceLocationResult> {
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => resolve(resultFrom({ coords: position.coords }) ?? failure("unavailable")),
      (error) =>
        resolve(
          error.code === 1
            ? // No settings screen to open from a page: the browser owns this.
              { status: "blocked", message: LOCATION_BROWSER_BLOCKED, remedy: "none" }
            : failure(error.code === 3 ? "timed_out" : "unavailable"),
        ),
      { enableHighAccuracy: true, timeout: PRECISE_FIX_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

/**
 * Ask (on the tap, never on launch) and, if allowed, read the position.
 * A refusal the phone will not ask about again is `blocked`, which the screen
 * answers with the phone's settings rather than a button that does nothing.
 */
export async function requestCurrentLocation(): Promise<DeviceLocationResult> {
  const geo = browserGeolocation();
  if (geo) return readBrowserPosition(geo);
  if (Platform.OS === "web") return failure("unavailable");
  const Location = loadLocation();
  if (!Location) return failure("needs_rebuild");
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return failure(permission.canAskAgain === false ? "blocked" : "denied");
    if (Location.hasServicesEnabledAsync && !(await Location.hasServicesEnabledAsync())) {
      return failure("services_off");
    }
    return await readPosition(Location);
  } catch (error) {
    return failure(isServicesOff(error) ? "services_off" : "unavailable");
  }
}

/** The fix rounded for words, or null when it is close enough to be a door. */
export function roughFixMeters(accuracyMeters: number | null | undefined): number | null {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters)) return null;
  return accuracyMeters > ROUGH_FIX_METERS ? Math.round(accuracyMeters) : null;
}
