/**
 * CARTO dark raster tiles for night maps.
 *
 * Same token as Rider and Client. Lives in gitignored `.env.local` as
 * `EXPO_PUBLIC_CARTO_API_KEY`. Never commit it. Light maps stay on OSM.
 *
 * Expo inlines `EXPO_PUBLIC_*` only as the literal member expression
 * `process.env.EXPO_PUBLIC_CARTO_API_KEY`. A lookup on a variable named
 * `env` is never rewritten, so a release bundle would ship the keyless URL.
 */
const DARK_TILE_BASE =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function cartoApiKey(
  raw: string | undefined = process.env.EXPO_PUBLIC_CARTO_API_KEY,
): string | null {
  const key = raw?.trim();
  return key ? key : null;
}

export function cartoDarkTileUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_CARTO_API_KEY,
): string {
  const key = cartoApiKey(raw);
  if (!key) return DARK_TILE_BASE;
  return `${DARK_TILE_BASE}?key=${encodeURIComponent(key)}`;
}
