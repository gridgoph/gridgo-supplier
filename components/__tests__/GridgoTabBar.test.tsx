import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_BAR_BOTTOM_DESIGN_PAD,
  TAB_BAR_CONTENT_MIN_HEIGHT,
} from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import { useAlertsStore } from "@/store/alerts";

const navigate = jest.fn();
const emit = jest.fn(() => ({ defaultPrevented: false }));

/**
 * The bar reads three things off the navigator: the route list, which index is
 * open, and the two navigation callbacks. Everything else in `BottomTabBarProps`
 * belongs to the navigator, so the cast keeps the fixture to what is actually
 * exercised rather than restating React Navigation's internals.
 */
function tabBarProps(openIndex: number): BottomTabBarProps {
  return {
    state: {
      index: openIndex,
      routes: TABS.map((tab) => ({ key: `${tab.name}-key`, name: tab.name })),
    },
    navigation: { emit, navigate },
  } as unknown as BottomTabBarProps;
}

type Insets = { top: number; left: number; right: number; bottom: number };

/** `useSafeAreaInsets` needs a provider; bottom is the value under test. */
function renderInSafeArea(
  ui: ReactElement,
  insets: Insets = { top: 47, left: 0, right: 0, bottom: 34 },
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets,
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

/** Flatten a RN style prop (object | array | falsy) to a single object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (style == null) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle));
  }
  if (typeof style === "object") return style as Record<string, unknown>;
  return {};
}

describe("GridgoTabBar", () => {
  beforeEach(() => {
    navigate.mockClear();
    emit.mockClear();
    useAlertsStore.setState({ unreadCount: 0 });
  });

  it("labels every destination, including Schedule", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of TABS) {
      expect(screen.getByText(tab.label)).toBeTruthy();
    }
  });

  it("exposes every tab to screen readers as a labelled tab", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    for (const tab of TABS) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeTruthy();
    }
  });

  it("marks only the open tab as selected", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(1)} />);

    expect(screen.getByRole("tab", { name: "Jobs", selected: true })).toBeTruthy();
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("navigates to a tab that is not open", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Alerts" }));

    expect(navigate).toHaveBeenCalledWith("notifications");
  });

  it("stays put when the open tab is pressed again", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Home" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("honours a tabPress handler that prevents the default", async () => {
    emit.mockReturnValueOnce({ defaultPrevented: true });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Schedule" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("announces unread alerts on the Alerts tab", async () => {
    useAlertsStore.setState({ unreadCount: 3 });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.getByRole("tab", { name: "Alerts, 3 unread" })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("caps the unread badge at 9+ without a fixed column height that clips it", async () => {
    useAlertsStore.setState({ unreadCount: 12 });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.getByRole("tab", { name: "Alerts, 12 unread" })).toBeTruthy();
    expect(screen.getByText("9+")).toBeTruthy();

    // Geometry regression guard: client-canonical pt-2/pb-2 leaves 20dp top
    // slack inside min-h-20 for the badge's -top-1 overhang. A tight fixed
    // height (h-13) clips; MD3 floor is min-h-20. Label-to-bottom-edge = 8dp.
    const alertsTab = screen.getByRole("tab", { name: "Alerts, 12 unread" });
    const className = String(alertsTab.props.className ?? "");
    expect(className).toContain("pt-2");
    expect(className).toContain("pb-2");
    expect(className).toContain("min-h-20");
    expect(className).toContain("justify-end");
    expect(className).not.toContain("h-13");
    expect(className).not.toMatch(/\bpt-4\b/);
    expect(className).not.toMatch(/\bpb-4\b/);
    expect(TAB_BAR_CONTENT_MIN_HEIGHT).toBe(80);
  });

  /**
   * System bottom inset is a keep-out zone; design pad is intentional spacing.
   * They must be added. Math.max silently drops the design pad on every modern
   * Android device where inset > 8.
   *
   * Representative Android bottoms:
   * - 48: gesture navigation (large keep-out)
   * - 24: three-button / mid OEM inset
   * - 0:  zero inset reported
   */
  it.each([
    { bottom: 48, label: "gesture / large inset" },
    { bottom: 24, label: "three-button / mid inset" },
    { bottom: 0, label: "zero inset" },
  ])(
    "stacks system bottom inset with design pad ($label)",
    async ({ bottom }) => {
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, {
        top: 24,
        left: 0,
        right: 0,
        bottom,
      });

      const bar = screen.getByTestId("gridgo-tab-bar");
      const paddingBottom = flattenStyle(bar.props.style).paddingBottom;

      expect(TAB_BAR_BOTTOM_DESIGN_PAD).toBe(8);
      // Additive composition — not Math.max.
      expect(paddingBottom).toBe(bottom + TAB_BAR_BOTTOM_DESIGN_PAD);

      if (bottom > TAB_BAR_BOTTOM_DESIGN_PAD) {
        // Math.max(bottom, 8) === bottom when bottom > 8; addition is larger.
        expect(paddingBottom).not.toBe(Math.max(bottom, TAB_BAR_BOTTOM_DESIGN_PAD));
        expect(paddingBottom).toBeGreaterThan(bottom);
      }
    },
  );

  it("allows modest dynamic type growth on tab labels", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const homeLabel = screen.getByText("Home");
    // Constrained bar, not a hard lockout of accessibility text.
    expect(homeLabel.props.maxFontSizeMultiplier).toBe(1.4);
    expect(homeLabel.props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});
