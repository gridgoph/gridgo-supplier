import { Platform } from "react-native";
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

/**
 * How this install reached the phone, as `POST /devices` reports it
 * (gridgo-api `docs/RELEASE_ANNOUNCEMENTS_API.md#install-channels`): `ios` for
 * every iPhone build (TestFlight), `play` for the Google Play bundle, `apk` for
 * the side-loaded APK. GRIDGO sends each release notice only to installs on its
 * own channel, so a Play or TestFlight tester never hears of a version before
 * their store has it. `null` on web, which no release reaches.
 */
export type InstallChannel = "apk" | "play" | "ios";

export function installChannel(
  os: string = Platform.OS,
  distribution: AppDistribution = buildDistribution(),
): InstallChannel | null {
  if (os === "ios") return "ios";
  if (os !== "android") return null;
  return distribution === "play" ? "play" : "apk";
}
