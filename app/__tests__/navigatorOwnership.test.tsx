import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import RootLayout from "@/app/_layout";
import { useSession } from "@/store/session";
import type { User } from "@/lib/api";

jest.mock("../../global.css", () => ({}));
jest.mock("@clerk/expo", () => ({ ClerkProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("@/components/ClerkSessionBridge", () => ({ ClerkSessionBridge: ({ children }: { children: ReactNode }) => children }));
jest.mock("@/components/BrandIntro", () => ({ BrandIntro: () => null }));
jest.mock("@/components/ToastHost", () => ({ ToastHost: () => null }));
jest.mock("@/hooks/useAlertStream", () => ({ useAlertStream: jest.fn() }));
jest.mock("@/hooks/useSupportChatUnread", () => ({ useSupportChatUnread: jest.fn() }));
jest.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: jest.fn() }));
jest.mock("@/hooks/useAppUpdateCheck", () => ({ useAppUpdateCheck: jest.fn() }));
jest.mock("@/hooks/usePushPromptCheck", () => ({ usePushPromptCheck: jest.fn() }));
jest.mock("@/hooks/useAppFonts", () => ({ useAppFonts: jest.fn() }));
jest.mock("@/hooks/useTheme", () => ({
  useHydrateTheme: jest.fn(), useThemeName: () => "light",
  useThemeColors: () => jest.requireActual("@/constants/theme").colors.light,
}));
jest.mock("@/lib/clerk", () => ({ ...jest.requireActual("@/lib/clerk"), resolveClerkPublishableKey: () => "pk_test_fixture" }));
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: { children: ReactNode }) => children }));
jest.mock("react-native-keyboard-controller", () => ({ KeyboardProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  initialWindowMetrics: null,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("expo-router/react-navigation", () => ({
  DarkTheme: { colors: {} }, DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("expo-router", () => {
  const { useState } = jest.requireActual("react");
  const { Text, TextInput } = jest.requireActual("react-native");
  function DraftScreen() {
    const [price, setPrice] = useState("");
    return <TextInput accessibilityLabel="Listing draft price" value={price} onChangeText={setPrice} />;
  }
  const Stack = Object.assign(
    ({ children }: { children: ReactNode }) => children,
    {
      Protected: ({ guard, children }: { guard: boolean; children: ReactNode }) => guard ? children : null,
      Screen: ({ name }: { name: string }) => name === "shop" ? <DraftScreen /> : name === "job/[id]" ? <Text>Job workspace</Text> : null,
    },
  );
  return { Stack };
});

const pending: User = { id: "supplier-one", name: "Shop", email: "shop@example.test", role: "supplier", verificationStatus: "pending" };

it("preserves an authorized listing draft through approval and clears it on account change", async () => {
  useSession.setState({ user: pending, identity: { kind: "supplier" } });
  const view = await render(<RootLayout />);
  await fireEvent.changeText(screen.getByLabelText("Listing draft price"), "150");
  expect(screen.queryByText("Job workspace")).toBeNull();
  await act(async () => { useSession.setState({ user: { ...pending, verificationStatus: "approved" } }); });
  expect(screen.getByLabelText("Listing draft price").props.value).toBe("150");
  expect(screen.getByText("Job workspace")).toBeTruthy();
  await act(async () => { useSession.setState({ user: { ...pending, verificationStatus: "suspended" } }); });
  expect(screen.getByLabelText("Listing draft price").props.value).toBe("150");
  expect(screen.queryByText("Job workspace")).toBeNull();
  await act(async () => { useSession.setState({ user: { ...pending, id: "supplier-two" } }); });
  expect(screen.getByLabelText("Listing draft price").props.value).toBe("");
  await view.unmount();
});
