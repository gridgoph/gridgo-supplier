import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet, Text } from "react-native";

import { SheetSurface, sheetBottomPadding } from "@/components/SheetSurface";
import { spacing } from "@/constants/theme";

describe("sheet bottom padding", () => {
  it("adds one page step on top of the system inset so the last action clears the home bar", () => {
    expect(sheetBottomPadding(0)).toBe(spacing.xl);
    expect(sheetBottomPadding(24)).toBe(24 + spacing.xl);
    expect(sheetBottomPadding(34)).toBe(34 + spacing.xl);
  });

  it("applies that padding on the surface, not a class that NativeWind can clobber", async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <SheetSurface
          title="Sign out of GRIDGO on this phone?"
          body="Your jobs and earnings stay with GRIDGO."
          footer={<Text>Stay signed in</Text>}
        />
      </SafeAreaProvider>,
    );

    const style = StyleSheet.flatten(screen.getByTestId("sheet-surface").props.style) ?? {};
    expect(style.paddingBottom).toBe(34 + spacing.xl);
  });
});
