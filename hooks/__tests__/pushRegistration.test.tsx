import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useSession } from "@/store/session";

/**
 * Registration is the whole point of push: a phone that allows notifications
 * but is not registered, or is registered to nobody, never rings. It happens at
 * launch, again when a shop signs in (claiming the unclaimed token), and on
 * every return to the foreground — which is also how a phone switched on in
 * the system settings gets registered.
 */

const mockRegister = jest.fn(async () => undefined);
const mockSync = jest.fn(async () => "granted");
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useRootNavigationState: () => ({ key: "root" }),
}));
jest.mock("@/store/push", () => ({
  usePush: {
    getState: () => ({
      registerIfGranted: mockRegister,
      syncPermission: mockSync,
      adoptToken: jest.fn(),
    }),
  },
}));

const shop = {
  id: "supplier-one",
  role: "supplier" as const,
  name: "Shop",
  email: "shop@example.test",
  verificationStatus: "approved" as const,
};

let onAppState: ((next: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  onAppState = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    onAppState = listener as (next: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  useSession.setState({ user: null, loading: false, sessionWait: null });
});

it("registers at launch signed out, then again when a shop signs in", async () => {
  await renderHook(() => usePushNotifications());
  expect(mockRegister).toHaveBeenCalledTimes(1);

  // Signing in re-runs registration with a bearer, which claims the token the
  // phone registered unclaimed at launch (see store/push.test.ts).
  await act(async () => useSession.setState({ user: shop }));
  expect(mockRegister).toHaveBeenCalledTimes(2);
});

it("re-reads the permission and registers on every return to the foreground", async () => {
  await renderHook(() => usePushNotifications());
  mockRegister.mockClear();
  expect(onAppState).not.toBeNull();

  await act(async () => onAppState?.("background"));
  expect(mockSync).not.toHaveBeenCalled();

  await act(async () => onAppState?.("active"));
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(mockRegister).toHaveBeenCalledTimes(1);
  expect(mockSync.mock.invocationCallOrder[0]).toBeLessThan(mockRegister.mock.invocationCallOrder[0]);
});
