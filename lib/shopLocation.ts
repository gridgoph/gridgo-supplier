import type { ShopLocation } from "@/lib/api";

/**
 * The one point on the map this app cares about: where the shop prints from.
 *
 * Not a branch list and not a service area. GRIDGO prices every delivery on the
 * straight-line distance from this pin to the client's drop-off, so a pin
 * dropped a kilometre out costs the shop money on every job it ever takes —
 * which is why the picker says so, and why nothing here quietly invents a
 * point when a shop has not placed one.
 */

export type ShopPin = ShopLocation;

/** Davao City, generously bounded. Outside this, the pin is worth questioning. */
const DAVAO_BOUNDS = { minLat: 6.85, maxLat: 7.55, minLng: 125.15, maxLng: 125.85 };

export function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A pin a shop has actually placed. `null` island is not a location. */
export function isPlaced(pin: ShopPin | null | undefined): pin is ShopPin {
  if (!pin) return false;
  if (!isCoordinate(pin.lat) || !isCoordinate(pin.lng)) return false;
  if (pin.lat === 0 && pin.lng === 0) return false;
  return Math.abs(pin.lat) <= 90 && Math.abs(pin.lng) <= 180;
}

/** True when the pin is somewhere GRIDGO does not operate. A warning, not a block. */
export function isFarFromDavao(pin: ShopPin | null | undefined): boolean {
  if (!isPlaced(pin)) return false;
  return (
    pin.lat < DAVAO_BOUNDS.minLat ||
    pin.lat > DAVAO_BOUNDS.maxLat ||
    pin.lng < DAVAO_BOUNDS.minLng ||
    pin.lng > DAVAO_BOUNDS.maxLng
  );
}

/** Six decimals is about 10 cm — enough to prove two pins are not the same one. */
export function coordinateText(pin: ShopPin): string {
  return `${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}`;
}

/** What is wrong with this pin, in the shop's own words. Null when it is fine. */
export function pinProblem(
  pin: ShopPin | null | undefined,
  label: string,
): string | null {
  if (!isPlaced(pin)) {
    return "Place your shop on the map. Search for your street, or tap where your shop stands.";
  }
  if (!label.trim()) {
    return "Give the pin an address a rider would recognise at the door.";
  }
  return null;
}

/** The sentence a shop needs to read before it accepts a pin it dragged roughly. */
export const PIN_CONSEQUENCE =
  "GRIDGO measures every delivery fee from this pin. Put it on your own door, not on the street corner.";

export function withLabel(pin: ShopPin, label: string): ShopPin {
  return { lat: pin.lat, lng: pin.lng, label: label.trim() };
}

/** True when saving would change nothing — the screen then draws no save action. */
export function isSamePin(a: ShopPin | null, b: ShopPin | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.lat - b.lat) < 1e-6 &&
    Math.abs(a.lng - b.lng) < 1e-6 &&
    a.label.trim() === b.label.trim()
  );
}
