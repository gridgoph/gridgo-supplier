import { Linking } from "react-native";
import { DOWNLOAD_URL } from "./appUpdate";
import type { InstallChannel } from "./buildDistribution";

/** The store destinations a release notice may name; never a URL from the payload. */
export type StoreTarget = "apk_download" | "play_store" | "testflight";

const STORE_TARGETS: readonly StoreTarget[] = ["apk_download", "play_store", "testflight"];

const PACKAGE = "ph.gridgo.supplier";

/** Where each target opens: a store app first, its web page if that app is missing. */
const DESTINATIONS: Record<StoreTarget, { url: string; fallback?: string }> = {
  apk_download: { url: DOWNLOAD_URL },
  play_store: {
    url: `market://details?id=${PACKAGE}`,
    fallback: `https://play.google.com/store/apps/details?id=${PACKAGE}`,
  },
  testflight: { url: "itms-beta://", fallback: "https://apps.apple.com/app/testflight/id899247664" },
};

/** The one channel each target belongs to. */
const TARGET_CHANNEL: Record<StoreTarget, InstallChannel> = {
  apk_download: "apk",
  play_store: "play",
  testflight: "ios",
};

export type ReleaseOpen = { target: StoreTarget; url: string; fallback?: string };

function read(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value.trim() || null : null;
}

/**
 * Where a tapped release notice (push `data` or an inbox row) opens, or `null`
 * to leave it to the inbox (gridgo-api `docs/RELEASE_ANNOUNCEMENTS_API.md`).
 *
 * A notice naming `releaseChannel` and `storeTarget` is acted on only when both
 * belong to this install's channel; an unknown target, or another channel's
 * notice, opens nothing here. A notice from before channels carries neither, so
 * the APK title is the only way to recognise one, and only an APK install acts
 * on it: a Play or TestFlight build never opens the side-load download.
 */
export function releaseNoticeOpen(
  data: unknown,
  title: unknown,
  channel: InstallChannel | null,
): ReleaseOpen | null {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (read(source, "type") !== "announcement" || !channel) return null;
  const releaseChannel = read(source, "releaseChannel");
  const storeTarget = read(source, "storeTarget");
  if (releaseChannel || storeTarget) {
    const target = STORE_TARGETS.find((known) => known === storeTarget);
    if (!target || releaseChannel !== channel || TARGET_CHANNEL[target] !== channel) return null;
    return { target, ...DESTINATIONS[target] };
  }
  if (channel !== "apk" || typeof title !== "string") return null;
  if (!/^GRIDGO Supplier (0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8}) is ready$/.test(title) || title.trim() !== title) return null;
  return { target: "apk_download", ...DESTINATIONS.apk_download };
}

/** Open a release destination, falling back to its web page when the store app is missing. */
export async function openRelease(open: ReleaseOpen): Promise<void> {
  try {
    await Linking.openURL(open.url);
  } catch {
    if (open.fallback) await Linking.openURL(open.fallback).catch(() => undefined);
  }
}
