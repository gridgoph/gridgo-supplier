/**
 * CARTO dark raster tiles for night maps.
 *
 * Same token as Rider and Client. Lives in gitignored `.env.local` as
 * `EXPO_PUBLIC_CARTO_API_KEY`. Never commit it. Light maps stay on OSM.
 */
const DARK_TILE_BASE =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function cartoApiKey(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.EXPO_PUBLIC_CARTO_API_KEY?.trim();
  return raw ? raw : null;
}

export function cartoDarkTileUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const key = cartoApiKey(env);
  if (!key) return DARK_TILE_BASE;
  return `${DARK_TILE_BASE}?key=${encodeURIComponent(key)}`;
}
