import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import appConfig, { clerkPublishableKey } from "../app.config";

const root = join(__dirname, "..");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: Partial<ExpoConfig>;
};

function context(config: Partial<ExpoConfig>): ConfigContext {
  return { projectRoot: root, staticConfigPath: null, packageJsonPath: null, config };
}

describe("Clerk Expo configuration", () => {
  const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
  });

  it("accepts only a public Clerk key", () => {
    expect(clerkPublishableKey(" pk_test_public ")).toBe("pk_test_public");
    expect(clerkPublishableKey("pk_live_public")).toBe("pk_live_public");
    expect(() => clerkPublishableKey("sk_test_secret")).toThrow(/publishable/i);
    expect(clerkPublishableKey(undefined)).toBeUndefined();
    expect(clerkPublishableKey("")).toBeUndefined();
  });

  it("puts the build-time publishable key in Expo extra", () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_public";
    const resolved = appConfig(context(appJson.expo));

    expect(resolved.extra).toMatchObject({ clerkPublishableKey: "pk_test_public" });
  });

  it("omits extra.clerkPublishableKey when the env is unset", () => {
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const resolved = appConfig(context(appJson.expo));

    expect(resolved.extra?.clerkPublishableKey).toBeUndefined();
  });

  it("does not embed the env identifier in operator-facing errors", () => {
    expect(() => clerkPublishableKey("sk_live_secret")).toThrow(
      /The Clerk publishable key must start with pk_/,
    );
    try {
      clerkPublishableKey("sk_live_secret");
    } catch (error) {
      expect(String(error)).not.toContain("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
    }
  });
});

describe("the app reads the baked extra key", () => {
  it("prefers extra and keeps a static env read so Gradle can still inline", () => {
    const layout = readFileSync(join(root, "app/_layout.tsx"), "utf8");
    const clerk = readFileSync(join(root, "lib/clerk.ts"), "utf8");
    expect(layout).toMatch(/extra\?\.clerkPublishableKey/);
    expect(layout).toMatch(/resolveClerkPublishableKey/);
    expect(clerk).toMatch(/process\.env\.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  });
});
