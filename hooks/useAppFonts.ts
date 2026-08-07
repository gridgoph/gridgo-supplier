import { useFonts } from "expo-font";

import { fontAssets } from "@/constants/fonts";

/**
 * Loads the app's typefaces.
 *
 * Returns true once the app may render. A font that fails to load resolves to
 * true as well: the platform system font is a usable fallback, and blocking on
 * a bad file would leave the user on a splash screen with no explanation.
 *
 * While `fontAssets` is empty this resolves immediately.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(fontAssets);
  return loaded || error !== null;
}
