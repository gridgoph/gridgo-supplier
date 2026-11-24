import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@clerk/expo", () => ({ useUser: () => ({ user: null }) }));

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
  getSupplierReadiness: jest.fn(async () => ({ readyForApproval: false, missing: [] })),
  acceptExpress: jest.fn(),
  transitionOrder: jest.fn(),
  getHomePrinter: jest.fn(),
  patchHomePrinter: jest.fn(),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadBoard: jest.fn(async () => ({ status: "not_open_yet" })),
}));

jest.mock("@/hooks/useBoard", () => ({
  ...jest.requireActual("@/hooks/useBoard"),
  loadServiceLines: jest.fn(async () => []),
}));

jest.mock("@/lib/deviceLocation", () => ({ requestCurrentLocation: jest.fn(async () => ({ status: "unavailable", message: "x", remedy: "none" })) }));

import HomeScreen from "@/app/(tabs)/home";
import { acceptExpress, getHomePrinter, listJobs, type Order, type User } from "@/lib/api";
import { useHomePrinter } from "@/store/homePrinter";
import { useSession } from "@/store/session";

const owner: User = { id: "u1", email: "home@example.com", name: "Owner", role: "supplier", supplierName: "Home", verificationStatus: "approved" };
const print = { fileId: "f", pages: { total: 3, range: null, printed: 3 }, copies: 1, colour: "bw", paper: "a4", sides: "one", layout: "fit_to_paper", note: "" };

const HOME = {
  version: 3,
  homePrinter: {
    level: "starter", verified: false, online: true, offersPaused: false, reason: null, deadlineAt: null,
    weeklyJobs: 4, weeklyJobCap: 30, offlineUntil: null, allowHomePickup: false,
    pinConsentWording: "pin", filePrivacyWording: "files",
  },
  pin: { point: { lat: 7.06, lng: 125.6 }, barangay: "Example barangay", street: "Example street", propertyType: "house", landmark: null, nextChangeAt: null },
};

function express(overrides: Record<string, unknown> = {}): Order {
  const now = Date.now();
  return {
    id: "ord_home1",
    title: "Express documents",
    state: "supplier_assigned",
    orderType: "express",
    fulfillmentMode: "delivery",
    supplierPriceMinor: 900,
    paymentMethod: "qr_manual",
    payments: { initial: { method: "qr_manual", status: "confirmed" } },
    expressOrder: { status: "sending", printSettings: [print], events: [] },
    shopAcceptance: { assignedAt: new Date(now - 60_000).toISOString(), deadlineAt: new Date(now + 4 * 60_000).toISOString(), workingMinutes: 5, status: "pending" },
    timeline: [],
    ...overrides,
  } as unknown as Order;
}

beforeEach(() => {
  jest.clearAllMocks();
  useHomePrinter.getState().reset();
  (getHomePrinter as jest.Mock).mockResolvedValue(HOME);
  useSession.setState({ user: owner, loading: false, error: null, authSource: "clerk", identity: { kind: "supplier" } });
});
afterEach(() => useSession.setState({ user: null, loading: false, error: null, authSource: "none", identity: { kind: "signed_out" } }));

it("puts the online switch and this week's count on To do, and accepts a document job", async () => {
  (listJobs as jest.Mock).mockResolvedValue([express()]);
  await render(<HomeScreen />);
  expect(await screen.findByTestId("home-switch-card")).toBeTruthy();
  expect(screen.getByText("You're online")).toBeTruthy();
  expect(screen.getByText("4 of 30 jobs this week")).toBeTruthy();
  // The offer is on the clock, so it comes before the switch.
  expect(within(screen.getByTestId("express-cards")).getByTestId("home-switch-card")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("express-card-accept"));
  await waitFor(() => expect(acceptExpress).toHaveBeenCalledWith("ord_home1", false));
});

it("offers a free give-back on an accepted job", async () => {
  const acceptedAt = new Date(Date.now() - 60_000).toISOString();
  (listJobs as jest.Mock).mockResolvedValue([
    express({
      state: "production",
      shopAcceptance: { assignedAt: acceptedAt, deadlineAt: acceptedAt, workingMinutes: 5, status: "accepted", acceptedAt },
    }),
  ]);
  await render(<HomeScreen />);
  expect(await screen.findByTestId("express-working-card")).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId("express-card-give-back")).toBeTruthy());
  expect(screen.getByText(/^Free until /)).toBeTruthy();
  await fireEvent.press(screen.getByText("Give it back"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/job/[id]/give-back", params: { id: "ord_home1" } });
});

it("draws nothing new for a print shop", async () => {
  (getHomePrinter as jest.Mock).mockRejectedValue(new (jest.requireActual("@/lib/api").ApiError)(404, { error: "home_printer_not_found" }));
  const acceptedAt = new Date(Date.now() - 60_000).toISOString();
  (listJobs as jest.Mock).mockResolvedValue([
    express({ state: "production", shopAcceptance: { assignedAt: acceptedAt, deadlineAt: acceptedAt, workingMinutes: 5, status: "accepted", acceptedAt } }),
  ]);
  await render(<HomeScreen />);
  expect(await screen.findByTestId("express-working-card")).toBeTruthy();
  await waitFor(() => expect(useHomePrinter.getState().home).toBe(false));
  expect(screen.queryByTestId("home-switch-card")).toBeNull();
  expect(screen.queryByText("Give it back")).toBeNull();
});
