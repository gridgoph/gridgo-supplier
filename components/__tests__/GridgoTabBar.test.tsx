import type { BottomTabBarProps } from "expo-router/js-tabs";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GridgoTabBar,
  TAB_BAR_METRICS,
  TAB_BAR_MIN_BOTTOM_GAP,
  TAB_ICON_SIZE,
  tabBarMetrics,
  tabBarPaddingBottom,
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

  it("paints the open mark in the same off-white the rider bar uses, not yellow", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const openLabel = screen.getByText("Home");
    const restLabel = screen.getByText("Jobs");
    expect(String(openLabel.props.className ?? "")).toContain("text-text-primary");
    expect(String(openLabel.props.className ?? "")).toContain("font-medium");
    expect(String(restLabel.props.className ?? "")).toContain("text-text-muted");
    expect(String(openLabel.props.className ?? "")).not.toMatch(/yellow/i);
    expect(flattenStyle(openLabel.props.style).color).toBeUndefined();
  });

  it("navigates to a tab that is not open", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    fireEvent.press(screen.getByRole("tab", { name: "Catalogues" }));

    expect(navigate).toHaveBeenCalledWith("catalogues");
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

  /**
   * Alerts left the bar for a bell in every masthead, and the unread badge went
   * with them. A bar that carries a number on one column is a bar a shop reads
   * for numbers; these five are places.
   */
  it("counts nothing, whatever is unread", async () => {
    useAlertsStore.setState({ unreadCount: 12 });

    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    expect(screen.queryByText("12")).toBeNull();
    expect(screen.queryByText("9+")).toBeNull();
    for (const tab of TABS) {
      expect(screen.getByRole("tab", { name: tab.label })).toBeTruthy();
    }
  });

  it("lets a column grow rather than clipping a label under dynamic type", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const tab = screen.getByRole("tab", { name: "Catalogues" });
    const className = String(tab.props.className ?? "");
    expect(className).toContain("justify-end");
    expect(className).not.toContain("h-13");
    expect(flattenStyle(tab.props.style).minHeight).toBe(TAB_BAR_METRICS.columnHeight);
  });

  /**
   * The content row comes from each platform's published bottom-bar figure.
   *
   * `tabBarMetrics` is pure, so both platforms are asserted in one run rather
   * than only whichever one the suite happens to be executing on. The item
   * padding has to add up to the container, or the bar is the platform's height
   * by accident rather than by construction.
   */
  describe("content row", () => {
    it("is the HIG's 49pt row on iOS, built from its own parts", () => {
      const m = tabBarMetrics("ios");
      expect(m.columnHeight).toBe(49);
      // 4 + 24 icon + 2 + 16 label + 3 = 49.
      expect(m.itemPaddingTop + TAB_ICON_SIZE + m.itemGap + 16 + m.itemPaddingBottom).toBe(49);
    });

    it("is Material 3's 80dp container on Android, built from its own parts", () => {
      const m = tabBarMetrics("android");
      expect(m.columnHeight).toBe(80);
      // 12 above the item and 16 below it, around a 24 icon and a 16 label.
      expect(m.itemPaddingTop).toBe(12);
      expect(m.itemPaddingBottom).toBe(16);
      expect(
        m.itemPaddingTop + TAB_ICON_SIZE + m.itemGap + 16 + m.itemPaddingBottom,
      ).toBeLessThanOrEqual(80);
    });

    it("clears the 44dp touch floor on both platforms", () => {
      expect(tabBarMetrics("ios").columnHeight).toBeGreaterThanOrEqual(44);
      expect(tabBarMetrics("android").columnHeight).toBeGreaterThanOrEqual(44);
    });
  });

  /**
   * The captain's two reports, one per platform, and the rule that answers both.
   *
   * iOS stood too high: an 80dp column plus a 34pt home-indicator inset plus an
   * 8pt design gap is 122pt against UIKit's 83. Android then stood too tall for
   * the same reason — under edge-to-edge the navigation bar reserves a real
   * inset (48dp three-button, 24dp gesture), and the gap was being added on top
   * of it as well.
   *
   * So: where the platform reserves a bottom inset, that inset *is* the
   * breathing room. The design gap is a floor for devices that reserve none.
   */
  describe("space below the content row", () => {
    it.each([
      { inset: 48, expected: 48, label: "Android three-button, edge-to-edge" },
      { inset: 24, expected: 24, label: "Android gesture navigation" },
      { inset: 34, expected: 34, label: "iPhone with a home indicator" },
      { inset: 0, expected: TAB_BAR_MIN_BOTTOM_GAP, label: "no inset (iPhone SE, hidden nav bar, web)" },
    ])("is $expected for $label", ({ inset, expected }) => {
      expect(tabBarPaddingBottom(inset)).toBe(expected);
    });

    it("never adds the design gap on top of an inset the platform already reserved", () => {
      for (const inset of [48, 34, 24, 16]) {
        expect(tabBarPaddingBottom(inset)).toBe(inset);
        expect(tabBarPaddingBottom(inset)).not.toBe(inset + TAB_BAR_MIN_BOTTOM_GAP);
      }
    });

    it("keeps the gap as a floor rather than discarding it — the Math.max ban", () => {
      // The ban was on losing the gap where there is no inset. That case is
      // exactly where the gap applies, and it is the one Android height that
      // must not move.
      expect(tabBarPaddingBottom(0)).toBe(TAB_BAR_MIN_BOTTOM_GAP);
      expect(tabBarPaddingBottom(0)).toBeGreaterThan(0);
    });

    it("gives each platform its published total bar height", () => {
      const ios = tabBarMetrics("ios").columnHeight;
      const android = tabBarMetrics("android").columnHeight;

      expect(ios + tabBarPaddingBottom(34)).toBe(83); // UIKit exactly
      expect(ios + tabBarPaddingBottom(0)).toBe(57);
      expect(android + tabBarPaddingBottom(24)).toBe(104); // MD3 + gesture inset
      expect(android + tabBarPaddingBottom(48)).toBe(128); // MD3 + three-button
      expect(android + tabBarPaddingBottom(0)).toBe(88); // unchanged from before
    });
  });

  /** The rendered container must actually use that rule, not restate it. */
  it.each([
    { bottom: 48, label: "Android three-button" },
    { bottom: 34, label: "iPhone home indicator" },
    { bottom: 24, label: "Android gesture" },
    { bottom: 0, label: "no inset" },
  ])("pads the bar by the rule ($label)", async ({ bottom }) => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, {
      top: 24,
      left: 0,
      right: 0,
      bottom,
    });

    const bar = screen.getByTestId("gridgo-tab-bar");
    expect(flattenStyle(bar.props.style).paddingBottom).toBe(
      tabBarPaddingBottom(bottom),
    );
  });

  it("allows modest dynamic type growth on tab labels", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const homeLabel = screen.getByText("Home");
    // Constrained bar, not a hard lockout of accessibility text.
    expect(homeLabel.props.maxFontSizeMultiplier).toBe(1.4);
    expect(homeLabel.props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });

  /**
   * Five equal columns, so Home's distance from the left edge is Account's
   * from the right — even though "Catalogues" is a longer word than "Home".
   * Side safe-area is applied equally; it is zero on a typical phone.
   */
  describe("icon gutters", () => {
    it("gives every destination the same share of the bar", async () => {
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

      const row = screen.getByTestId("gridgo-tab-bar-row");
      const className = String(row.props.className ?? "");
      expect(className).toContain("w-full");
      expect(className).not.toContain("justify-evenly");
      expect(flattenStyle(row.props.style).paddingLeft).toBe(0);
      expect(flattenStyle(row.props.style).paddingRight).toBe(0);
    });

    it("keeps left and right edge padding equal when the phone has a side inset", async () => {
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />, {
        top: 24,
        left: 12,
        right: 12,
        bottom: 24,
      });

      const row = screen.getByTestId("gridgo-tab-bar-row");
      const style = flattenStyle(row.props.style);
      expect(style.paddingLeft).toBe(12);
      expect(style.paddingRight).toBe(12);
    });

    it("centres each mark in an equal column, so a long label does not steal the edge", async () => {
      await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

      const home = screen.getByRole("tab", { name: "Home" });
      const catalogues = screen.getByRole("tab", { name: "Catalogues" });
      expect(String(home.props.className ?? "")).toContain("flex-1");
      expect(String(catalogues.props.className ?? "")).toContain("flex-1");
      expect(String(home.props.className ?? "")).toContain("items-center");
      expect(String(screen.getByText("Catalogues").props.className ?? "")).toContain("text-center");
    });
  });

  /**
   * The surface fills the container, so the bar a person sees is exactly
   * `content region + design pad + system inset`. It used to be offset 16dp
   * from the top so that a raised action disc could overhang the paint — this
   * app has never had one, and the offset only made every height two numbers.
   */
  it("paints the whole bar, so its height needs nothing subtracted", async () => {
    await renderInSafeArea(<GridgoTabBar {...tabBarProps(0)} />);

    const surface = screen.getByTestId("gridgo-tab-bar-surface");
    const className = String(surface.props.className ?? "");
    expect(className).toContain("absolute");
    expect(className).toContain("inset-0");
    expect(className).toContain("border-t");
    expect(className).toContain("border-outline");
    expect(className).toContain("bg-surface");
    expect(className).not.toMatch(/\btop-4\b/);
  });
});
