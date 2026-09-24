import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Platform } from "react-native";

import RootLayout from "@/app/_layout";
import type { User } from "@/lib/api";
import { useAppUpdate } from "@/store/appUpdate";
import { useSession } from "@/store/session";

jest.mock("../../global.css", () => ({}));
jest.mock("@clerk/expo", () => ({ ClerkProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("@/components/ClerkSessionBridge", () => ({
  ClerkSessionBridge: ({ children }: { children: ReactNode }) => children,
}));
// The opening finishes on its own, the way it does on a phone.
jest.mock("@/components/BrandIntro", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    BrandIntro: ({ onDone }: { onDone: () => void }) => {
      useEffect(() => {
        const timer = setTimeout(onDone, 50);
        return () => clearTimeout(timer);
      }, [onDone]);
      return null;
    },
  };
});
jest.mock("@/components/ToastHost", () => ({ ToastHost: () => null }));
jest.mock("@/hooks/useAlertStream", () => ({ useAlertStream: jest.fn() }));
jest.mock("@/hooks/useSupportChatUnread", () => ({ useSupportChatUnread: jest.fn() }));
jest.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: jest.fn() }));
jest.mock("@/hooks/useAppFonts", () => ({ useAppFonts: jest.fn() }));
jest.mock("@/hooks/useTheme", () => ({
  useHydrateTheme: jest.fn(),
  useThemeName: () => "light",
  useThemeColors: () => jest.requireActual("@/constants/theme").colors.light,
}));
jest.mock("@/lib/clerk", () => ({
  ...jest.requireActual("@/lib/clerk"),
  resolveClerkPublishableKey: () => "pk_test_fixture",
}));
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  initialWindowMetrics: null,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("expo-router/react-navigation", () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
// A navigator just real enough for a pushed sheet: `router.push` adds a route
// to whichever Stack is mounted, and that Stack's `app-update` screen renders
// the real sheet. A re-keyed Stack is a new navigator with no history, as on
// a phone.
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  const Pushed = React.createContext([] as string[]);
  const navigator: { push: ((href: string) => void) | null; pop: (() => void) | null } = {
    push: null,
    pop: null,
  };
  function Stack({ children }: { children: ReactNode }) {
    const [pushed, setPushed] = React.useState([] as string[]);
    React.useEffect(() => {
      navigator.push = (href: string) => setPushed((list: string[]) => [...list, href]);
      navigator.pop = () => setPushed((list: string[]) => list.slice(0, -1));
      return () => {
        navigator.push = null;
        navigator.pop = null;
      };
    }, []);
    return <Pushed.Provider value={pushed}>{children}</Pushed.Provider>;
  }
  function Screen({ name }: { name: string }) {
    const pushed: string[] = React.useContext(Pushed);
    if (name !== "app-update" || !pushed.includes("/app-update")) return null;
    const Sheet = jest.requireActual("@/app/app-update").default;
    return <Sheet />;
  }
  function Protected({ guard, children }: { guard: boolean; children: ReactNode }) {
    return guard ? children : null;
  }
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return {
    Stack,
    router: {
      push: jest.fn((href: string) => navigator.push?.(href)),
      back: jest.fn(() => navigator.pop?.()),
      canGoBack: jest.fn(() => true),
      replace: jest.fn(),
    },
    useNavigation: () => ({ addListener: jest.fn(() => jest.fn()) }),
  };
});
// Expo Go: no real versionCode, so only the development override makes a build.
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
  default: {
    appOwnership: "expo",
    executionEnvironment: "storeClient",
    expoConfig: { version: "1.0.0", android: { versionCode: 1 }, extra: {} },
  },
}));

const TITLE = "A new version of GRIDGO is ready";
const shop: User = {
  id: "supplier-one",
  name: "Shop",
  email: "shop@example.test",
  role: "supplier",
  verificationStatus: "approved",
};

// The first render loads the whole root layout; allow for it.
jest.setTimeout(15_000);

let fetchMock: jest.Mock;

beforeEach(async () => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE = "90";
  jest.replaceProperty(Platform, "OS", "android");
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "v1.0.95", draft: false, prerelease: false }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  await AsyncStorage.clear();
  useAppUpdate.setState({
    lastSeenVersionCode: null,
    snooze: null,
    lastCheckedAt: null,
    checking: false,
    offer: null,
    completed: null,
    sheetOpen: false,
  });
  useSession.setState({ user: null, identity: { kind: "signed_out" }, sessionWait: null });
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE;
  jest.restoreAllMocks();
});

// The path firstmate tests on a phone: Expo Go on Android, served by
// `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=90 npx expo start --go`, the
// real root layout from launch through the opening to the sheet — signed out,
// because a shop that never signs in still has to hear about a new build.
describe("root layout, forced update check in Expo Go", () => {
  it("offers the latest release once the opening is over, and logs why", async () => {
    const view = await render(<RootLayout />);
    expect(await screen.findByText(TITLE, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("1.0.90")).toBeTruthy();
    expect(screen.getByText("1.0.95")).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": "GRIDGO-supplier" }),
      }),
    );
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] installed 1.0.90 (versionCode 90, forced by override)",
    );
    expect(console.info).toHaveBeenCalledWith("[update-check] latest release is 1.0.95");
    expect(console.info).toHaveBeenCalledWith("[update-check] offering 1.0.95 over 1.0.90");
    await view.unmount();
  });

  // Clerk restores a session after the opening can finish. The stack is
  // re-keyed when the shop arrives, which takes the sheet down with it — that
  // is the navigator's doing, not the shop's, and must not be put off as a
  // "Later" that is then remembered for the rest of the day.
  it("brings the offer back on the new stack when a restored session re-keys it", async () => {
    const view = await render(<RootLayout />);
    expect(await screen.findByText(TITLE, {}, { timeout: 3000 })).toBeTruthy();

    await act(async () => {
      useSession.setState({ user: shop, identity: { kind: "supplier" } });
    });

    expect(await screen.findByText(TITLE, {}, { timeout: 3000 })).toBeTruthy();
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] the sheet was taken down with the stack; it will be shown again",
    );
    expect(useAppUpdate.getState().snooze).toBeNull();
    expect(useAppUpdate.getState().offer?.latest.versionCode).toBe(95);
    await view.unmount();
  });
});
