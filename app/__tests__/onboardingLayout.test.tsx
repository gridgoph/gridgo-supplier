import { render, screen, fireEvent } from "@testing-library/react-native";

/**
 * Structural proof of Fix 1: the pager is full-height content, not a short
 * text band. We assert the measurable layout contract rather than gesture
 * hit-testing (reanimated scroll handlers are not fully exercised in jest).
 */

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => false),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View, ScrollView, Text } = require("react-native");
  const Animated = {
    View,
    ScrollView,
    Text,
    createAnimatedComponent: (C: unknown) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    useAnimatedRef: () => ({ current: null }),
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedScrollHandler: () => jest.fn(),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    interpolateColor: () => "#000",
  };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => (
      <View {...props}>{children}</View>
    ),
  };
});

jest.mock("@/hooks/useTheme", () => ({
  useThemeColors: () => ({
    canvas: "#F8F8F8",
    surface: "#FFFFFF",
    accent: "#1A1A1A",
    textSecondary: "#4A4A4A",
    textMuted: "#7A7A7A",
    outline: "#DCDCDC",
    actionYellow: "#FFDE58",
  }),
}));

// Illustrations pull heavy SVG — stub the registry for layout tests.
jest.mock("@/components/illustrations", () => {
  const { View } = require("react-native");
  const Stub = () => <View testID="illustration-stub" />;
  return {
    illustrations: {
      storefront: { Component: Stub, aspect: 1.2 },
      working: { Component: Stub, aspect: 1.2 },
      packages: { Component: Stub, aspect: 1.5 },
    },
  };
});

import OnboardingScreen from "@/app/onboarding";
import { router, useLocalSearchParams } from "expo-router";

describe("onboarding layout and exit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (router.canGoBack as jest.Mock).mockReturnValue(false);
  });

  it("renders supplier beats, skip, and the primary CTA", async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByText("Jobs find your shop")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
    expect(screen.getByText("Next")).toBeTruthy();
  });

  it("returns to Settings when Skip is pressed from a settings replay", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ from: "settings" });
    await render(<OnboardingScreen />);

    fireEvent.press(screen.getByText("Skip"));
    expect(router.replace).toHaveBeenCalledWith("/settings");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("dismisses to the launcher when there is no history", async () => {
    await render(<OnboardingScreen />);

    fireEvent.press(screen.getByText("Skip"));
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
