import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { iosStoreBuildProblems } from "../app.config";

/**
 * The iPhone build's App Store settings (store review blockers 5B.2 in the
 * store plan): no iPad, specific purpose strings, the encryption answer, and
 * the refusal of a store build without its EAS environment variables.
 */

const appJson = JSON.parse(readFileSync(resolve(__dirname, "../app.json"), "utf8")) as {
  expo: { ios: { supportsTablet: boolean; infoPlist: Record<string, unknown> }; plugins: unknown[] };
};

describe("app.json iOS", () => {
  const { ios } = appJson.expo;

  it("ships for iPhone only", () => {
    // Apple will not let an app drop iPad support once it has shipped with it.
    expect(ios.supportsTablet).toBe(false);
  });

  it("answers the export-compliance question: HTTPS only", () => {
    expect(ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it("gives every purpose string a GRIDGO sentence, never a plugin default", () => {
    for (const [key, value] of Object.entries(ios.infoPlist)) {
      if (!key.endsWith("UsageDescription")) continue;
      expect(String(value)).toMatch(/^GRIDGO /);
      expect(String(value)).not.toMatch(/\$\(PRODUCT_NAME\)/);
    }
  });

  it("gives every purpose string a plugin writes a GRIDGO sentence too", () => {
    // expo-audio, the image picker and WebRTC write their strings from these
    // options on iOS. The same options feed the Android build, so they stay
    // plugin options rather than moving into ios.infoPlist.
    const strings = appJson.expo.plugins.flatMap((entry) =>
      Array.isArray(entry)
        ? Object.entries(entry[1] as Record<string, unknown>)
            .filter(([key, value]) => key.endsWith("Permission") && typeof value === "string")
            .map(([, value]) => String(value))
        : [],
    );
    expect(strings.length).toBeGreaterThan(0);
    for (const value of strings) expect(value).toMatch(/^GRIDGO /);
  });

  it("keeps the call microphone and disables background playback on both platforms", () => {
    // A shop still talks to the rider on an in-app call. Background audio is
    // disabled in the native config too, so Android declares no media-playback
    // foreground service. Foreground calls keep their microphone permission.
    const audio = appJson.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === "expo-audio",
    ) as [string, Record<string, unknown>];
    expect(audio[1].microphonePermission).toMatch(/^GRIDGO uses the microphone/);
    expect(audio[1].enableBackgroundPlayback).toBe(false);
  });

  it("registers Sign in with Apple's plugin", () => {
    expect(appJson.expo.plugins).toContain("expo-apple-authentication");
  });
});

describe("iosStoreBuildProblems", () => {
  const complete = {
    EAS_BUILD_PLATFORM: "ios",
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_API_URL: "https://api.example.com",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_abc",
    EXPO_PUBLIC_CARTO_API_KEY: "carto",
    GOOGLE_SERVICE_INFO_PLIST: "/build/GoogleService-Info.plist",
  };

  it("passes a complete App Store build", () => {
    expect(iosStoreBuildProblems(complete)).toEqual([]);
  });

  it("names every missing variable and never its value", () => {
    const problems = iosStoreBuildProblems({
      ...complete,
      EXPO_PUBLIC_API_URL: "http://10.0.2.2:8787",
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_secretish",
      EXPO_PUBLIC_CARTO_API_KEY: "",
      GOOGLE_SERVICE_INFO_PLIST: undefined,
    });
    expect(problems).toHaveLength(4);
    expect(problems.join(" ")).toMatch(/EXPO_PUBLIC_API_URL/);
    expect(problems.join(" ")).toMatch(/EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
    expect(problems.join(" ")).toMatch(/EXPO_PUBLIC_CARTO_API_KEY/);
    expect(problems.join(" ")).toMatch(/GOOGLE_SERVICE_INFO_PLIST/);
    expect(problems.join(" ")).not.toMatch(/pk_test_secretish|10\.0\.2\.2/);
  });

  it("asks nothing of any other build", () => {
    expect(iosStoreBuildProblems({})).toEqual([]);
    expect(iosStoreBuildProblems({ ...complete, EAS_BUILD_PLATFORM: "android", GOOGLE_SERVICE_INFO_PLIST: "" })).toEqual([]);
    expect(iosStoreBuildProblems({ EAS_BUILD_PLATFORM: "ios", EAS_BUILD_PROFILE: "development" })).toEqual([]);
  });
});
