import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PickSheet from "@/app/pick";
import { sheetListMaxHeight } from "@/components/SheetSurface";
import { timeChoices, timeLabel } from "@/lib/shopHours";
import { askPick, useSheets } from "@/store/sheets";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: () => () => undefined }),
}));

// A small Android phone: 360 × 640 dp, status bar 24, three-button bar 48.
const SMALL_ANDROID = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

function timeOptions() {
  return timeChoices().map((minute) => ({ value: String(minute), label: timeLabel(minute) }));
}

/**
 * gridgo-supplier#216: Shop hours' time lists ran off the bottom of a small
 * Android phone (closing time stopped at 7:30 AM, "Stay open until" at
 * 3:00 PM) because the sheet had nothing to scroll.
 */
describe("pick sheet with a long list", () => {
  afterEach(() => useSheets.setState({ pick: null }));

  it("holds the list inside the screen, clear of the navigation bar", () => {
    const max = sheetListMaxHeight(640, SMALL_ANDROID.insets);
    expect(max).toBeGreaterThanOrEqual(176);
    // The sheet's heading and actions still fit above the navigation bar.
    expect(max + 300).toBeLessThanOrEqual(640 - 24 - 48);
    // A short list is never squeezed below about three rows.
    expect(sheetListMaxHeight(400, { top: 24, bottom: 48 })).toBe(176);
  });

  it("scrolls to the last half-hour and picks it", async () => {
    const choice = askPick({
      title: "Closing time",
      body: "The same time on every day you open.",
      options: timeOptions(),
      selected: String(17 * 60),
      cancelLabel: "Keep this time",
    });

    const view = await render(
      <SafeAreaProvider initialMetrics={SMALL_ANDROID}>
        <PickSheet />
      </SafeAreaProvider>,
    );

    const list = screen.getByTestId("pick-options");
    expect(list.type).toBe("RCTScrollView");
    // The renderer's window is jest-expo's, not the phone's; the bound is the
    // same function either way.
    expect(StyleSheet.flatten(list.props.style).maxHeight).toBe(
      sheetListMaxHeight(Dimensions.get("window").height, SMALL_ANDROID.insets),
    );
    expect(list.props.nestedScrollEnabled).toBe(true);

    await fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { y: 2400 },
        contentSize: { height: 2496, width: 328 },
        layoutMeasurement: { height: 268, width: 328 },
      },
    });

    const last = timeLabel(23 * 60 + 30);
    expect(last).toBe("11:30 PM");
    await fireEvent.press(screen.getByRole("radio", { name: last }));

    await expect(choice).resolves.toBe(String(23 * 60 + 30));
    await view.unmount();
  });
});
