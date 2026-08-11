import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json stays the whole configuration. This file only stamps the build
 * identity onto it.
 *
 * A sideloaded APK has no store listing, so the version a shop reads in
 * Settings → Apps is the only handle anyone has on "which build is on this
 * phone". Leaving it at the app.json value means every APK ever shipped calls
 * itself 1.0.0, and Android refuses to install one release over another
 * unless `versionCode` has gone up.
 *
 * So the build number owns the patch segment: app.json keeps MAJOR.MINOR as
 * the release line, CI appends its run number (`GRIDGO_BUILD_NUMBER`, set in
 * `.github/workflows/android-release.yml`), and `versionCode` is that same
 * number. With no build number — any local `expo start` — the app.json version
 * stands unchanged and nothing pretends to be a release.
 *
 * The rule lives here rather than in `lib/`: @expo/config evaluates this file
 * with its own TypeScript loader, which does not resolve an extensionless
 * relative `.ts` import, and the `.ts` spelling that does resolve is a `tsc`
 * error (TS5097). `__tests__/appConfigVersion.test.ts` calls these exports
 * directly, so the rule is tested where it runs.
 */

const RELEASE_LINE = /^(\d+)\.(\d+)(?:\.|$)/;

export type BuildVersion = {
  /** Human-visible version string, e.g. "1.0.42". */
  versionName: string;
  /** Android versionCode — must increase for an install to be an upgrade. */
  versionCode: number;
};

/**
 * @param baseVersion `expo.version` from app.json, e.g. "1.0.0".
 * @param buildNumber CI run number; blank or absent outside CI.
 */
export function buildVersion(
  baseVersion: string,
  buildNumber: string | null | undefined,
): BuildVersion {
  const line = RELEASE_LINE.exec(baseVersion.trim());
  if (!line) {
    throw new Error(
      `app.json expo.version must start with MAJOR.MINOR, got "${baseVersion}"`,
    );
  }

  const build = (buildNumber ?? "").trim();
  if (!build) return { versionName: baseVersion.trim(), versionCode: 1 };

  if (!/^\d+$/.test(build)) {
    throw new Error(`Build number must be a whole number, got "${build}"`);
  }

  const versionCode = Number(build);
  if (versionCode < 1) {
    throw new Error(`Build number must be 1 or greater, got "${build}"`);
  }

  return { versionName: `${line[1]}.${line[2]}.${versionCode}`, versionCode };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, slug, version } = config;
  if (!name || !slug || !version) {
    throw new Error("app.json must define expo.name, expo.slug and expo.version");
  }

  const { versionName, versionCode } = buildVersion(
    version,
    process.env.GRIDGO_BUILD_NUMBER,
  );

  return {
    ...config,
    name,
    slug,
    version: versionName,
    android: { ...config.android, versionCode },
  };
};
