import fs from "node:fs";
import path from "node:path";

import { Platform } from "react-native";
import { nestedStackScreenOptions, stackScreenOptions, sheetScreenOptions } from "@/lib/navigationOptions";
import { colors } from "@/constants/theme";

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-router/react-navigation", () => ({ HeaderBackButton: "HeaderBackButton" }));

type NestedArgs = Parameters<ReturnType<typeof nestedStackScreenOptions>>[0];

/** A screen in a nested stack whose routes are `keys`, in order. */
function nestedScreen(keys: string[], key: string) {
  const goBack = jest.fn();
  const args = {
    route: { key, name: key },
    navigation: { getState: () => ({ routes: keys.map((k) => ({ key: k })) }), goBack },
  } as unknown as NestedArgs;
  return { args, goBack };
}

function onPlatform<T>(platform: string, run: () => T): T {
  const previous = Platform.OS;
  Platform.OS = platform as typeof Platform.OS;
  try {
    return run();
  } finally {
    Platform.OS = previous;
  }
}

describe("shared stack chrome", () => {
  it.each(["light", "dark"] as const)("keeps the %s theme while fixing inset ownership", (scheme) => {
    expect(stackScreenOptions(scheme, 0)).toMatchObject({
      headerStyle: { backgroundColor: colors[scheme].surface },
      headerTintColor: colors[scheme].textPrimary,
      contentStyle: { backgroundColor: colors[scheme].canvas },
      unstable_nativeProps: { headerConfig: { disableTopInsetApplication: true } },
    });
    expect(stackScreenOptions(scheme, 46)).toMatchObject({
      unstable_nativeProps: { headerConfig: { disableTopInsetApplication: false } },
    });
    expect(sheetScreenOptions(scheme)).toMatchObject({
      headerShown: false,
      presentation: "formSheet",
    });
  });

  it.each(["ios", "web"] as const)("keeps %s native overrides absent", (platform) => {
    const previous = Platform.OS;
    Platform.OS = platform;
    try {
      expect(stackScreenOptions("light", 0)).not.toHaveProperty("unstable_nativeProps");
      expect(stackScreenOptions("dark", 59)).not.toHaveProperty("unstable_nativeProps");
    } finally {
      Platform.OS = previous;
    }
  });

  it.each([
    ["app/_layout.tsx", "stackScreenOptions(scheme, top)"],
    ["app/job/[id]/_layout.tsx", "nestedStackScreenOptions(scheme, top)"],
    ["app/shop/_layout.tsx", "nestedStackScreenOptions(scheme, top)"],
    ["app/services/_layout.tsx", "nestedStackScreenOptions(scheme, top)"],
    // Its first step draws the same borrowed chevron on every platform.
    ["app/(auth)/signup/_layout.tsx", "stackScreenOptions(scheme, top)"],
  ])("uses measured insets for root and nested stacks: %s", (file, options) => {
    const source = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(source).toContain("const { top } = useSafeAreaInsets()");
    expect(source).toContain(`screenOptions={${options}}`);
  });

  /**
   * The captain's iPhone: a job or listing opened from a tab had no back
   * control. UIKit draws a back item only for a screen below it in the same
   * stack, and the first screen of a nested stack has none; Android's toolbar
   * walks up to the parent and was always fine.
   */
  describe("the first screen of a nested stack", () => {
    it("borrows the bare chevron on iOS and pops the parent", () => {
      const { args, goBack } = nestedScreen(["index"], "index");
      const options = onPlatform("ios", () => nestedStackScreenOptions("dark", 59)(args));
      const left = options.headerLeft?.({ canGoBack: true, tintColor: colors.dark.textPrimary });

      expect(left).toMatchObject({
        type: "HeaderBackButton",
        props: { displayMode: "minimal", tintColor: colors.dark.textPrimary },
      });
      (left as unknown as { props: { onPress: () => void } }).props.onPress();
      expect(goBack).toHaveBeenCalledTimes(1);
    });

    it("draws nothing on iOS when nothing is behind the stack (a deep link)", () => {
      const { args } = nestedScreen(["index"], "index");
      const options = onPlatform("ios", () => nestedStackScreenOptions("light", 0)(args));
      expect(options.headerLeft?.({ canGoBack: false })).toBeNull();
    });

    it("leaves later screens to the native back item on iOS", () => {
      const { args } = nestedScreen(["index", "accept"], "accept");
      const options = onPlatform("ios", () => nestedStackScreenOptions("light", 0)(args));
      expect(options).not.toHaveProperty("headerLeft");
    });

    it.each(["android", "web"])("changes nothing on %s", (platform) => {
      const { args } = nestedScreen(["index"], "index");
      const options = onPlatform(platform, () => nestedStackScreenOptions("light", 0)(args));
      expect(options).toEqual(onPlatform(platform, () => stackScreenOptions("light", 0)));
    });
  });
});
