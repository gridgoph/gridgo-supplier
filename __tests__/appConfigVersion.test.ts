import { readFileSync } from "fs";
import { join } from "path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import appConfig, { buildVersion } from "../app.config";

/**
 * The build identity stamped onto app.json — see `app.config.ts`.
 *
 * A sideloaded APK is the only copy of itself a shop will ever hold, so a
 * version stuck at 1.0.0 across every build leaves nobody able to say which
 * one is on a phone, and a `versionCode` that never rises makes the next
 * release refuse to install over it.
 */

const root = join(__dirname, "..");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: Partial<ExpoConfig>;
};

function context(config: Partial<ExpoConfig>): ConfigContext {
  return { projectRoot: root, staticConfigPath: null, packageJsonPath: null, config };
}

describe("buildVersion", () => {
  it("appends the build number as the patch segment", () => {
    expect(buildVersion("1.0.0", "42")).toEqual({
      versionName: "1.0.42",
      versionCode: 42,
    });
  });

  it("keeps the release line app.json declares", () => {
    expect(buildVersion("2.7.0", "5").versionName).toBe("2.7.5");
    expect(buildVersion("1.3", "9").versionName).toBe("1.3.9");
  });

  it("leaves a local build on the app.json version", () => {
    for (const absent of [undefined, null, "", "   "]) {
      expect(buildVersion("1.0.0", absent)).toEqual({
        versionName: "1.0.0",
        versionCode: 1,
      });
    }
  });

  it("rises with the build number, so the next install is an upgrade", () => {
    expect(buildVersion("1.0.0", "42").versionCode).toBeGreaterThan(
      buildVersion("1.0.0", "41").versionCode,
    );
  });

  it("rejects a version app.json cannot mean", () => {
    expect(() => buildVersion("v1", "1")).toThrow(/MAJOR\.MINOR/);
  });

  it("rejects a build number Android cannot use", () => {
    expect(() => buildVersion("1.0.0", "42-dirty")).toThrow(/whole number/);
    expect(() => buildVersion("1.0.0", "0")).toThrow(/1 or greater/);
  });
});

describe("app.config stamps app.json without disturbing it", () => {
  const original = process.env.GRIDGO_BUILD_NUMBER;
  afterEach(() => {
    if (original === undefined) delete process.env.GRIDGO_BUILD_NUMBER;
    else process.env.GRIDGO_BUILD_NUMBER = original;
  });

  it("stamps the CI build number onto the real app.json", () => {
    process.env.GRIDGO_BUILD_NUMBER = "77";
    const resolved = appConfig(context(appJson.expo));

    expect(resolved.version).toBe("1.0.77");
    expect(resolved.android?.versionCode).toBe(77);
  });

  it("carries every other key through untouched", () => {
    delete process.env.GRIDGO_BUILD_NUMBER;
    const resolved = appConfig(context(appJson.expo));

    expect(resolved.slug).toBe(appJson.expo.slug);
    expect(resolved.plugins).toEqual(appJson.expo.plugins);
    expect(resolved.android?.package).toBe(appJson.expo.android?.package);
    expect(resolved.version).toBe(appJson.expo.version);
  });

  it("refuses a config missing the identity it stamps", () => {
    expect(() => appConfig(context({ name: "GRIDGO Supplier", slug: "gridgo-supplier" }))).toThrow(
      /expo\.version/,
    );
  });
});
