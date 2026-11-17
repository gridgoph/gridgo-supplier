import type { ShopLocation } from "@/lib/api";
import { pointInDavao, type PinPrecision } from "@/lib/geocode";

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
  // The same box search is bounded to: a pin search could never have
  // offered is not one to save without a second look.
  return !pointInDavao(pin.lat, pin.lng);
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

/* --------------------------------------------------------------------------
   The line above the address field

   What the shop needs to know about the pin before it trusts it, and nothing
   when there is nothing to say. Pure, so every state is tested without a map.
   -------------------------------------------------------------------------- */

export const READING_PLACE = "Reading this place…";
export const OUTSIDE_TITLE = "Outside Davao City";
export const OUTSIDE_DETAIL = "GRIDGO only sends riders inside Davao City. Move the pin onto your shop.";
export const DRAG_TO_DOOR = "Drag the pin onto your shop's door.";
export const NO_STREET_TITLE = "No street name on the map here";
export const UNREAD_TITLE = "Could not read this address";
export const TYPE_IT_BELOW = "Type it below so the rider can find you.";

export type PinTone = "busy" | "warning" | "hint";

export type PinStatus = { tone: PinTone; title: string; detail?: string };

export type PinStatusInput = {
  placed: boolean;
  /** The address lookup for a pin the shop moved is still out. */
  reading: boolean;
  outside: boolean;
  /** How the last lookup for a moved pin ended, when it named nothing. */
  lookup: "no_street" | "failed" | null;
  /** From a search result; null once the shop places the pin by hand. */
  precision: PinPrecision | null;
  /** The searched place's name, for "the middle of Talomo". */
  placeName: string;
};

export function pinStatus(input: PinStatusInput): PinStatus | null {
  // Before a pin, the map's own hint says what to do; saying it twice is noise.
  if (!input.placed) return null;
  if (input.outside) return { tone: "warning", title: OUTSIDE_TITLE, detail: OUTSIDE_DETAIL };
  if (input.reading) return { tone: "busy", title: READING_PLACE };
  if (input.precision === "area") {
    return {
      tone: "hint",
      title: input.placeName ? `This is the middle of ${input.placeName}` : "This is the middle of the area",
      detail: DRAG_TO_DOOR,
    };
  }
  if (input.precision === "street") {
    return {
      tone: "hint",
      title: input.placeName ? `Somewhere on ${input.placeName}` : "Somewhere on this road",
      detail: DRAG_TO_DOOR,
    };
  }
  if (input.lookup === "no_street") return { tone: "hint", title: NO_STREET_TITLE, detail: TYPE_IT_BELOW };
  if (input.lookup === "failed") return { tone: "hint", title: UNREAD_TITLE, detail: TYPE_IT_BELOW };
  return null;
}
