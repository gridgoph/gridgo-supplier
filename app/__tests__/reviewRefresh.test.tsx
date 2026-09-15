import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";
import { useSession } from "@/store/session";
import CapacityScreen from "@/app/capacity";
import PayoutScreen from "@/app/payout";
import HomeScreen from "@/app/(tabs)/home";
import ScheduleScreen from "@/app/(tabs)/schedule";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@clerk/expo", () => ({ useUser: () => ({ user: null }) }));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listJobs: jest.fn(), listSupplierServices: jest.fn(), updateSupplierService: jest.fn(),
  getTaxonomy: jest.fn(async () => null), listNotifications: jest.fn(async () => []),
}));
jest.mock("@/lib/listingsApi", () => ({ loadBoard: jest.fn(async () => ({ status: "not_open_yet" })) }));
jest.mock("@/hooks/useBoard", () => ({ loadServiceLines: jest.fn(async () => []) }));

const service = { id: "svc_1", categoryCode: "tarpaulin", state: "live", capacityDaily: 10, capacityWeekly: 100, turnaroundHours: 24 } as api.SupplierService;
const job: api.Order = {
  id: "ord_1", title: "Current print job", state: "production", timeline: [],
  clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
  address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
  paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
  updatedAt: "2026-09-01T00:00:00Z",
  quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
  supplierPriceMinor: 100000, createdAt: "2026-09-01T00:00:00Z",
  payoutMilestones: [{ code: "printing", sharePercent: 50, amountMinor: 50000, status: "pending_pof", pofFileIds: [], releasedAt: null }],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: { id: "shop", name: "Shop", email: "shop@example.test", role: "supplier", verificationStatus: "approved" } });
  (api.listSupplierServices as jest.Mock).mockResolvedValue([]);
});

it("preserves capacity edits made while a live reload is pending", async () => {
  (api.listSupplierServices as jest.Mock).mockResolvedValue([service]);
  const view = await render(<CapacityScreen />);
  await screen.findByLabelText(/^Daily capacity for/);
  let receive!: (value: api.SupplierService[]) => void;
  (api.listSupplierServices as jest.Mock).mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }));
  await act(async () => { invalidate("services"); });
  await waitFor(() => expect(api.listSupplierServices).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByLabelText(/^Increase Daily capacity for/));
  await act(async () => { receive([{ ...service, capacityDaily: 20 }]); });
  expect(screen.getByLabelText(/^Daily capacity for/).props.accessibilityValue.now).toBe(15);
  (api.updateSupplierService as jest.Mock).mockResolvedValue({ ...service, capacityDaily: 15 });
  await fireEvent.press(screen.getByLabelText("Save capacity"));
  expect(api.updateSupplierService).toHaveBeenCalledWith("svc_1", { capacityDaily: 15, capacityWeekly: 100, turnaroundHours: 24 });
  await view.unmount();
});

it.each([
  ["Payout", PayoutScreen], ["Home", HomeScreen], ["Schedule", ScheduleScreen],
] as const)("%s ignores an older focus response after the live response", async (_name, Screen) => {
  let receive!: (value: api.Order[]) => void;
  (api.listJobs as jest.Mock)
    .mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }))
    .mockResolvedValue([job]);
  const view = await render(<Screen />);
  await act(async () => { invalidate("jobs"); });
  expect((await screen.findAllByText("Current print job")).length).toBeGreaterThan(0);
  await act(async () => { receive([]); });
  expect(screen.getAllByText("Current print job").length).toBeGreaterThan(0);
  await view.unmount();
});
