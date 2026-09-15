import fs from "node:fs";
import path from "node:path";

import { Platform } from "react-native";
import { stackScreenOptions, sheetScreenOptions } from "@/lib/navigationOptions";
import { colors } from "@/constants/theme";

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

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
    "app/_layout.tsx",
    "app/job/[id]/_layout.tsx",
    "app/shop/_layout.tsx",
    "app/services/_layout.tsx",
    "app/(auth)/signup/_layout.tsx",
  ])("uses measured insets for root and nested stacks: %s", (file) => {
    const source = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(source).toContain("const { top } = useSafeAreaInsets()");
    expect(source).toContain("stackScreenOptions(scheme, top)");
  });
});
