import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

/**
 * Where this build's `google-services.json` comes from.
 *
 * Push on Android needs the Firebase config for `ph.gridgo.supplier` in project
 * `gridgo-c2ce9`. One file covers all three GRIDGO packages and the Expo plugin
 * picks the entry by package name. That file is the captain's and is **never
 * committed** — `.gitignore` keeps it out — so it reaches a build as
 * configuration:
 *
 * - `GOOGLE_SERVICES_JSON` names a path (what CI sets, from a repository
 *   secret written to a file outside the workspace);
 * - otherwise a `google-services.json` dropped in the repo root is used, which
 *   is how a developer's machine and a local release build get it;
 * - otherwise the key is omitted entirely.
 *
 * Omitting is deliberate rather than fatal: `npx expo start`, `npx tsc`, the
 * test suite and `npx expo config --type public` all have to work on a machine
 * that has never seen the file, and they do — the build simply has no Firebase,
 * `getDevicePushTokenAsync` throws, and `store/push.ts` treats push as
 * unavailable and shows no card. What must never happen quietly is a *release*
 * built without it, so `.github/workflows/android-release.yml` asserts the file
 * is present, and is this app's, before it calls prebuild.
 *
 * A path that is named and missing is always an error: it means the wiring is
 * broken, and falling back would ship an APK that silently never receives
 * anything.
 *
 * @param envPath `process.env.GOOGLE_SERVICES_JSON`.
 * @param projectRoot directory the repo-root fallback is resolved against.
 * @param fileExists injected for the test; defaults to a real filesystem check.
 */
export function googleServicesFile(
  envPath: string | null | undefined,
  projectRoot: string,
  fileExists: (path: string) => boolean = existsSync,
): string | undefined {
  const named = (envPath ?? "").trim();
  if (named) {
    const path = resolve(projectRoot, named);
    if (!fileExists(path)) {
      throw new Error(
        `GOOGLE_SERVICES_JSON points at "${named}", which does not exist. ` +
          "A build with a broken Firebase path would install and never receive an alert.",
      );
    }
    return path;
  }

  const local = resolve(projectRoot, "google-services.json");
  return fileExists(local) ? local : undefined;
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

  const googleServices = googleServicesFile(process.env.GOOGLE_SERVICES_JSON, __dirname);

  return {
    ...config,
    name,
    slug,
    version: versionName,
    android: {
      ...config.android,
      versionCode,
      // Spread rather than assigned: `googleServicesFile: undefined` is a key
      // the Expo plugin still sees, and it resolves it as a path.
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
    },
  };
};
