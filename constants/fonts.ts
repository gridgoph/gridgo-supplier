/**
 * Font registration.
 *
 * Satoshi (Indian Type Foundry, Fontshare Free EULA — see Satoshi-LICENSE.txt)
 * carries all UI type. Four cuts ship: the weights the type scale actually
 * uses. Italics and Light are not bundled because nothing in the system asks
 * for them.
 *
 * React Native resolves a font by family name alone — it will not pick
 * Satoshi-Bold from `font-weight: 700`. So every cut is registered under its
 * own name, and `global.css` maps the `font-*` classes onto those names:
 *
 *   font-normal / font-sans  ->  Satoshi-Regular
 *   font-medium              ->  Satoshi-Medium
 *   font-bold                ->  Satoshi-Bold
 *   font-black / font-brand  ->  Satoshi-Black
 *
 * Add a cut here and it must also get a `--font-*` entry in global.css, or
 * nothing can reach it.
 *
 * Still outstanding from the type spec: Poppins ExtraBold (brand display) and
 * Instrument Serif (rare decorative text). `--font-brand` points at
 * Satoshi-Black until Poppins is licensed — naming an unloaded family renders
 * blank on Android, so it cannot point at Poppins ahead of the file.
 */
// `Record<string, number>`, not expo-font's `FontSource`: that union includes
// `Asset`, which resolves to `any` in this project and would erase the type.
// Metro returns a module id for a required asset, so `number` is exact.
export const fontAssets: Record<string, number> = {
  "Satoshi-Regular": require("../assets/fonts/Satoshi-Regular.otf"),
  "Satoshi-Medium": require("../assets/fonts/Satoshi-Medium.otf"),
  "Satoshi-Bold": require("../assets/fonts/Satoshi-Bold.otf"),
  "Satoshi-Black": require("../assets/fonts/Satoshi-Black.otf"),
};

/**
 * Family names for the style exception list — navigation headers, and anywhere
 * else a class cannot reach. Everywhere else, use the `font-*` classes.
 */
export const fontFamily = {
  regular: "Satoshi-Regular",
  medium: "Satoshi-Medium",
  bold: "Satoshi-Bold",
  black: "Satoshi-Black",
} as const;
