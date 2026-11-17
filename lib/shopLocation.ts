import type { ShopLocation } from "@/lib/api";
import { roughFixMeters } from "@/lib/deviceLocation";
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

export const PIN_OUTSIDE_PROBLEM = "Your pin is outside Davao City. Move it onto your shop.";
export const PIN_READING_PROBLEM = "Wait a moment while the address at your pin loads.";
export const PIN_LOCATING_PROBLEM = "Wait a moment while your phone finds where you are.";

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

/**
 * True when the pin is outside Davao City as far as the phone can tell
 * without a network: outside the box GRIDGO searches, or on Samal or Talikud.
 * The picker also keeps the address lookup's verdict per pin, and the screens
 * refuse to save either.
 */
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
  // Checked here, without a network, so a typed address cannot carry a pin
  // on Samal past a failed lookup — on a moved, saved or restored pin alike.
  if (isFarFromDavao(pin)) return PIN_OUTSIDE_PROBLEM;
  if (!label.trim()) {
    return "Give the pin an address a rider would recognise at the door.";
  }
  return null;
}

/** One press of a nudge button: a doorway's width, small enough to aim with. */
export const NUDGE_METERS = 3;

export type NudgeDirection = "north" | "south" | "east" | "west";

const METERS_PER_DEGREE_LAT = 111320;

/** The pin moved `meters` one way: up the screen is north on this map. */
export function nudgePin(
  pin: { lat: number; lng: number },
  direction: NudgeDirection,
  meters: number = NUDGE_METERS,
): { lat: number; lng: number } {
  const dLat = meters / METERS_PER_DEGREE_LAT;
  const dLng = meters / (METERS_PER_DEGREE_LAT * Math.cos((pin.lat * Math.PI) / 180));
  switch (direction) {
    case "north":
      return { lat: pin.lat + dLat, lng: pin.lng };
    case "south":
      return { lat: pin.lat - dLat, lng: pin.lng };
    case "east":
      return { lat: pin.lat, lng: pin.lng + dLng };
    default:
      return { lat: pin.lat, lng: pin.lng - dLng };
  }
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
export const FINDING_YOU = "Finding you…";
export const FINDING_YOU_DETAIL = "Stand at your shop. Outdoors or near a window is quicker.";
export const PHONE_PLACED_TITLE = "Placed where your phone is";
export const PHONE_PLACED_DETAIL = "If you are not at your shop now, drag the pin onto its door.";

/** "Your phone placed this within about 85 m" — how rough a GPS fix is, in words. */
export function roughFixTitle(meters: number): string {
  return `Your phone placed this within about ${meters} m`;
}

export type PinTone = "busy" | "warning" | "hint";

export type PinStatus = { tone: PinTone; title: string; detail?: string };

export type PinStatusInput = {
  placed: boolean;
  /** Use my location is waiting on the phone. Said before anything else. */
  locating?: boolean;
  /**
   * The phone's error radius for a pin Use my location set; null once the
   * shop moves it by hand or picks a search result.
   */
  accuracyMeters?: number | null;
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
  if (input.locating) return { tone: "busy", title: FINDING_YOU, detail: FINDING_YOU_DETAIL };
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
  // After the lookup states: an address to type is the shop's next step;
  // the circle on the map still says how rough the fix is.
  if (typeof input.accuracyMeters === "number" && input.accuracyMeters > 0) {
    // Same threshold as the client: above 30 m a fix is a neighbourhood.
    const rough = roughFixMeters(input.accuracyMeters);
    return rough != null
      ? { tone: "hint", title: roughFixTitle(rough), detail: DRAG_TO_DOOR }
      : { tone: "hint", title: PHONE_PLACED_TITLE, detail: PHONE_PLACED_DETAIL };
  }
  return null;
}


/**
 * What stops the pin being used, beyond `pinProblem`: a point the address
 * lookup placed in another town (Samal sits inside the search box, so the box
 * alone cannot say), or a move whose lookup has not answered yet.
 */
export function pinBlocker(input: { outside: boolean; reading: boolean; locating?: boolean }): string | null {
  if (input.locating) return PIN_LOCATING_PROBLEM;
  if (input.outside) return PIN_OUTSIDE_PROBLEM;
  if (input.reading) return PIN_READING_PROBLEM;
  return null;
}
