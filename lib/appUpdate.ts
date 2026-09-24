/**
 * Is there a newer GRIDGO Supplier than the one on this phone?
 *
 * A shop sideloads this app, so no store tells it when a new build is out.
 * Every merge to `main` does three things (`.github/workflows/android-release.yml`):
 * stamps the APK with `versionCode` = the CI run number and version
 * `MAJOR.MINOR.<run>` (`app.config.ts`), creates a public GitHub Release tagged
 * `v<version>`, and replaces the APK at {@link DOWNLOAD_URL}. So the release
 * tag's last number and the installed `versionCode` are the same counter, and
 * comparing them is the whole check.
 *
 * This module is pure on purpose — no React, no storage, no `expo-*` — because
 * the client and rider apps carry the same feature and should be able to take
 * this file as it is. The only per-app values are the three URLs below.
 *
 * Every failure is silent. Offline, rate-limited (GitHub allows 60
 * unauthenticated requests an hour per IP), a malformed answer: all of them
 * mean "no offer this time", never an error a shop has to read. A missed check
 * costs nothing; the next launch asks again.
 */

/** The public repo whose latest Release names the newest build. */
export const LATEST_RELEASE_URL =
  "https://api.github.com/repos/gridgoph/gridgo-supplier/releases/latest";

/** Always the newest APK. Opening it hands the install to Android. */
export const DOWNLOAD_URL = "https://gridgo.talasora.com/downloads/gridgo-supplier.apk";

/** The human page, named when the APK link itself cannot be opened. */
export const DOWNLOAD_PAGE_URL = "https://gridgo.talasora.com/download";

/**
 * How long a foreground return waits before asking again. A launch always
 * asks; coming back from the camera every few minutes should not.
 */
export const FOREGROUND_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** A check that has not answered by then is a check that failed. */
export const CHECK_TIMEOUT_MS = 10_000;

export type Build = {
  /** Android `versionCode` — the CI run number. */
  versionCode: number;
  /** What a shop reads, e.g. "1.0.84". */
  versionName: string;
};

export type LatestRelease = Build & {
  /** ISO timestamp the Release was published, when GitHub gave one. */
  publishedAt: string | null;
  /** Size of the APK attached to the Release, when there is one. */
  apkBytes: number | null;
};

/** "Later" on an offer: quiet for this version for the rest of this day. */
export type Snooze = {
  versionCode: number;
  /** Local calendar day, `YYYY-MM-DD`. */
  dayKey: string;
};

const RELEASE_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_LINE = /^(\d+)\.(\d+)(?:\.|$)/;

/** "v1.0.84" → { versionCode: 84, versionName: "1.0.84" }. */
export function parseReleaseTag(tag: unknown): Build | null {
  if (typeof tag !== "string") return null;
  const match = RELEASE_TAG.exec(tag.trim());
  if (!match) return null;
  const versionCode = Number(match[3]);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) return null;
  return { versionCode, versionName: `${match[1]}.${match[2]}.${match[3]}` };
}

/** The body of `GET /releases/latest`, read defensively. */
export function parseLatestRelease(body: unknown): LatestRelease | null {
  if (!body || typeof body !== "object") return null;
  const release = body as Record<string, unknown>;
  if (release.draft === true || release.prerelease === true) return null;

  const build = parseReleaseTag(release.tag_name);
  if (!build) return null;

  const publishedAt =
    typeof release.published_at === "string" && !Number.isNaN(Date.parse(release.published_at))
      ? release.published_at
      : null;

  let apkBytes: number | null = null;
  if (Array.isArray(release.assets)) {
    for (const asset of release.assets as unknown[]) {
      if (!asset || typeof asset !== "object") continue;
      const { name, size } = asset as Record<string, unknown>;
      if (typeof name === "string" && name.toLowerCase().endsWith(".apk")) {
        if (typeof size === "number" && size > 0) apkBytes = size;
        break;
      }
    }
  }

  return { ...build, publishedAt, apkBytes };
}

type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Ask GitHub for the newest Release. Resolves `null` on every failure —
 * offline, timeout, rate limit, a 404 while a repo has no Release yet, or an
 * answer this module cannot read. Never rejects.
 */
export async function fetchLatestRelease(
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<LatestRelease | null> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    return parseLatestRelease(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type InstalledBuildInput = {
  /** `Constants.expoConfig?.android?.versionCode`. */
  versionCode: unknown;
  /** `Constants.expoConfig?.version`. */
  versionName: unknown;
  /**
   * A signed Android release: not `__DEV__`, not Expo Go, running on Android.
   * Only such a build has a `versionCode` that means anything.
   */
  releaseBuild: boolean;
  /**
   * `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE`, honoured in development
   * only, so the prompt can be seen in Expo Go. Pretends this phone is on that
   * build.
   */
  forceVersionCode?: string | null;
  /** `__DEV__`. The override is ignored outside development. */
  dev: boolean;
};

/**
 * The build on this phone, or `null` when there is nothing to compare.
 *
 * A development build and Expo Go carry app.json's `versionCode: 1`, which
 * would be "older" than every release — so they are skipped unless the
 * override names a number. A release built without `GRIDGO_BUILD_NUMBER`
 * (a local `assembleRelease`) is also `1`, and is skipped for the same reason:
 * it is not a build any Release is newer than in a meaningful way.
 */
export function installedBuild(input: InstalledBuildInput): Build | null {
  const baseName = typeof input.versionName === "string" ? input.versionName.trim() : "";

  const forced = (input.forceVersionCode ?? "").trim();
  if (input.dev && forced) {
    if (!/^\d+$/.test(forced)) return null;
    const versionCode = Number(forced);
    if (versionCode < 1) return null;
    const line = RELEASE_LINE.exec(baseName);
    const prefix = line ? `${line[1]}.${line[2]}` : "1.0";
    return { versionCode, versionName: `${prefix}.${versionCode}` };
  }

  if (!input.releaseBuild) return null;
  const versionCode = input.versionCode;
  if (typeof versionCode !== "number" || !Number.isSafeInteger(versionCode) || versionCode <= 1) {
    return null;
  }
  return { versionCode, versionName: baseName || String(versionCode) };
}

/** A launch always checks; a return to the foreground waits out the interval. */
export function shouldCheck(
  reason: "launch" | "foreground",
  lastCheckedAt: number | null,
  now: number,
): boolean {
  if (reason === "launch" || lastCheckedAt === null) return true;
  return now - lastCheckedAt >= FOREGROUND_CHECK_INTERVAL_MS;
}

/**
 * Whether to put the offer in front of the shop.
 *
 * Newer only — a phone somehow ahead of the latest Release (a build installed
 * by hand before its Release was published) is never told to "update" down.
 * "Later" holds for that version until the day changes; a still newer version
 * is a new question and is asked the same day.
 */
export function shouldOffer(
  installed: Build,
  latest: Build,
  snooze: Snooze | null,
  todayKey: string,
): boolean {
  if (latest.versionCode <= installed.versionCode) return false;
  if (snooze && snooze.versionCode === latest.versionCode && snooze.dayKey === todayKey) {
    return false;
  }
  return true;
}

/**
 * The upgrade this launch is the first run of, if any.
 *
 * Android's installer owns the install itself, so the app cannot say "done" at
 * that moment — it says it on the first launch of the new build. A first
 * install has nothing to compare against and says nothing.
 */
export function completedUpdate(lastSeenVersionCode: number | null, installed: Build): boolean {
  return lastSeenVersionCode !== null && installed.versionCode > lastSeenVersionCode;
}

/** 130409988 → "130 MB". Decimal megabytes, as Android's own download UI counts. */
export function formatDownloadSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / 1_000_000;
  if (mb < 1) return "Under 1 MB";
  return `${Math.round(mb)} MB`;
}
