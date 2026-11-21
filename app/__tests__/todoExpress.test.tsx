import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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
import { router } from "expo-router";
import { acceptExpress, listJobs, transitionOrder, type Order, type User } from "@/lib/api";
import { useSession } from "@/store/session";

const owner: User = { id: "u1", email: "shop@example.com", name: "Owner", role: "supplier", supplierName: "Shop", verificationStatus: "approved" };
const staff: User = { ...owner, id: "u2", shopRole: "staff" };

const print = { fileId: "f", pages: { total: 24, range: null, printed: 24 }, copies: 1, colour: "bw", paper: "a4", sides: "one", layout: "fit_to_paper", note: "" };

function express(overrides: Record<string, unknown> = {}): Order {
  const now = Date.now();
  return {
    id: "ord_3ff0128e105a",
    title: "Express documents",
    state: "supplier_assigned",
    orderType: "express",
    fulfillmentMode: "pickup",
    supplierPriceMinor: 7200,
    paymentMethod: "qr_manual",
    payments: { initial: { method: "qr_manual", status: "confirmed" } },
    expressOrder: { status: "sending", printSettings: [print], events: [] },
    shopAcceptance: { assignedAt: new Date(now - 60_000).toISOString(), deadlineAt: new Date(now + 4 * 60_000).toISOString(), workingMinutes: 5, status: "pending" },
    timeline: [],
    ...overrides,
  } as unknown as Order;
}

function signIn(user: User) {
  useSession.setState({ user, loading: false, error: null, authSource: "clerk", identity: { kind: "supplier" } });
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => useSession.setState({ user: null, loading: false, error: null, authSource: "none", identity: { kind: "signed_out" } }));

it("puts the Express offer on top with pages, how the client paid and what the shop earns", async () => {
  signIn(owner);
  (listJobs as jest.Mock).mockResolvedValue([express()]);
  const view = await render(<HomeScreen />);
  expect(await screen.findByTestId("express-offer-card")).toBeTruthy();
  expect(screen.getByText("24 pages · B&W")).toBeTruthy();
  expect(screen.getByText(/Paid in app/)).toBeTruthy();
  expect(screen.getByTestId("express-card-earn")).toBeTruthy();
  expect(screen.getByText("Can't do it")).toBeTruthy();
  await view.unmount();
});

it("accepts from the card in one tap", async () => {
  signIn(owner);
  (listJobs as jest.Mock).mockResolvedValue([express()]);
  (acceptExpress as jest.Mock).mockResolvedValue(undefined);
  const view = await render(<HomeScreen />);
  await fireEvent.press(await screen.findByTestId("express-card-accept"));
  expect(acceptExpress).toHaveBeenCalledWith("ord_3ff0128e105a", false);
  await view.unmount();
});

it("It's ready puts an accepted job on the press and marks it ready in one tap", async () => {
  signIn(owner);
  const working = express({ state: "payment_authorized", shopAcceptance: null });
  (listJobs as jest.Mock).mockResolvedValue([working]);
  (transitionOrder as jest.Mock).mockImplementation(async (_id: string, state: string) => ({ ...working, state }));
  const view = await render(<HomeScreen />);
  await fireEvent.press(await screen.findByTestId("express-card-ready"));
  await waitFor(() => expect(transitionOrder).toHaveBeenCalledTimes(2));
  expect((transitionOrder as jest.Mock).mock.calls.map((call) => call[1])).toEqual(["production", "ready_for_dispatch"]);
  expect(router.push).not.toHaveBeenCalled();
  await view.unmount();
});

it("opens the finished-photo step when GRIDGO wants photos before ready", async () => {
  signIn(owner);
  const working = express({ state: "payment_authorized", shopAcceptance: null });
  (listJobs as jest.Mock).mockResolvedValue([working]);
  const { ApiError } = jest.requireActual("@/lib/api");
  (transitionOrder as jest.Mock)
    .mockResolvedValueOnce({ ...working, state: "production" })
    .mockRejectedValueOnce(new ApiError(409, { error: "production_finished_required" }));
  const view = await render(<HomeScreen />);
  await fireEvent.press(await screen.findByTestId("express-card-ready"));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/job/[id]/finished", params: { id: working.id } }));
  await view.unmount();
});

it("shows Staff the same card with no money on it", async () => {
  signIn(staff);
  (listJobs as jest.Mock).mockResolvedValue([express()]);
  const view = await render(<HomeScreen />);
  expect(await screen.findByTestId("express-offer-card")).toBeTruthy();
  expect(screen.queryByTestId("express-card-earn")).toBeNull();
  expect(screen.queryByTestId("todo-money-line")).toBeNull();
  expect(screen.queryByText(/₱/)).toBeNull();
  await view.unmount();
});
