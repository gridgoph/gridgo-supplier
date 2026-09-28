import { render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listJobs: jest.fn(async () => []),
  listNotifications: jest.fn(async () => []),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadBoard: jest.fn(async () => ({ status: "not_open_yet" })),
}));

jest.mock("@/hooks/useBoard", () => ({
  ...jest.requireActual("@/hooks/useBoard"),
  loadServiceLines: jest.fn(async () => []),
}));

import HomeScreen from "@/app/(tabs)/home";
import { listJobs, type Order, type User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * The first-run tour starts on Home, once, for a new shop — and never unasked
 * for a shop that already has work. Replay under Account is the way back.
 */

const shop: User = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier",
  supplierName: "PrintRight",
  verificationStatus: "approved",
};

function signIn(user: User) {
  useSession.setState({
    user,
    loading: false,
    error: null,
    authSource: "clerk",
    identity: { kind: "supplier" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useTour.getState().reset();
  useTour.setState({ hydrated: true });
});

afterEach(() => {
  useSession.setState({
    user: null,
    loading: false,
    error: null,
    authSource: "none",
    identity: { kind: "signed_out" },
  });
});

it("starts for a new shop with no jobs, on Home's step", async () => {
  signIn(shop);
  const view = await render(<HomeScreen />);

  await waitFor(() =>
    expect(useTour.getState().progress.u1).toEqual({ status: "active", step: 0 }),
  );
  expect(useTour.getState().screen).toBe("home");
  await view.unmount();
});

it("starts for a shop still waiting on Operations", async () => {
  signIn({ ...shop, verificationStatus: "pending" });
  const view = await render(<HomeScreen />);

  await waitFor(() =>
    expect(useTour.getState().progress.u1).toEqual({ status: "active", step: 0 }),
  );
  await view.unmount();
});

it("never starts on its own for a shop that already has jobs", async () => {
  (listJobs as jest.Mock).mockResolvedValueOnce([{ id: "ord_1" } as unknown as Order]);
  signIn(shop);
  const view = await render(<HomeScreen />);

  await screen.findByLabelText("Alerts");
  await waitFor(() => expect(listJobs).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(useTour.getState().progress.u1).toBeUndefined();
  await view.unmount();
});

it("does not start again for a shop that skipped it", async () => {
  useTour.setState({ progress: { u1: { status: "done" } } });
  signIn(shop);
  const view = await render(<HomeScreen />);

  await screen.findByLabelText("Alerts");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(useTour.getState().progress.u1).toEqual({ status: "done" });
  await view.unmount();
});
