import { parseAppDistribution, type AppDistribution } from "@/lib/appUpdate";

/**
 * This build's distribution: `play` only in the Google Play bundle CI builds
 * with `EXPO_PUBLIC_APP_DISTRIBUTION=play`, otherwise the side-load APK.
 *
 * Read as the literal `process.env.EXPO_PUBLIC_…` so Babel inlines it at
 * bundle time; a member access on `env` would never be replaced.
 */
export function buildDistribution(): AppDistribution {
  return parseAppDistribution(process.env.EXPO_PUBLIC_APP_DISTRIBUTION);
}
