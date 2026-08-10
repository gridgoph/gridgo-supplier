/**
 * The parts of Davao a shop can say it works out of.
 *
 * GRIDGO prices delivery by the distance from the shop to the drop-off, so it
 * needs a point on the map before an account is worth anything. This app has no
 * map and no location permission at the door — a shop is filling in a form, not
 * standing in its own doorway — so it picks the part of the city it is in and
 * types the street address, and the point below stands in until Operations
 * confirms the exact pin during accreditation. The sign-up screen says so.
 *
 * Names follow the platform's own delivery zones so a shop reads the same words
 * here and on a job. The coordinates are the centre of each area.
 */

export type DavaoArea = {
  code: string;
  /** The area as a person in Davao would name it. */
  name: string;
  lat: number;
  lng: number;
};

export const DAVAO_AREAS: readonly DavaoArea[] = [
  { code: "davao_poblacion", name: "Poblacion / downtown", lat: 7.0644, lng: 125.6085 },
  { code: "davao_central", name: "Bajada / JP Laurel", lat: 7.085, lng: 125.6136 },
  { code: "davao_south", name: "Matina", lat: 7.0567, lng: 125.59 },
  { code: "davao_north", name: "Lanang", lat: 7.108, lng: 125.642 },
  { code: "davao_east", name: "Buhangin / Sasa", lat: 7.118, lng: 125.648 },
  { code: "davao_west", name: "Toril", lat: 7.0125, lng: 125.498 },
] as const;

export function findArea(code: string | null): DavaoArea | null {
  return DAVAO_AREAS.find((area) => area.code === code) ?? null;
}
