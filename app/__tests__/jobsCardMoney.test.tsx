import { render, screen } from "@testing-library/react-native";
import JobsScreen from "@/app/(tabs)/jobs";
import * as api from "@/lib/api";
import type { Order, ProductionItem } from "@/lib/api";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    jest.requireActual("react").useEffect(callback, [callback]);
  },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listJobs: jest.fn() }));

const item: ProductionItem = {
  id: "line_1", itemName: "Flyers", quantity: 100, pricingUnit: "per_piece",
  packageQty: null, measurement: null, structuredSpec: { material: "gloss_paper" },
  options: [{ groupName: "Size", label: "A5" }], artworkFileId: null, mockupFileId: null,
};
const job: Order = {
  id: "ord_12345678", clientId: "client", supplierId: "supplier", riderId: null,
  state: "out_for_delivery", productId: "flyers", title: "Flyers", quantity: 100,
  size: "", material: "", deadline: null, address: "", zone: "",
  supplierPriceMinor: 40000, totalMinor: 51500, deliveryFeeMinor: 1500,
  paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", timeline: [],
  productionItems: [item],
};

it("shows the shop amount and selected size even while a job waits on someone else", async () => {
  jest.mocked(api.listJobs).mockResolvedValue([job]);
  await render(<JobsScreen />);
  expect(await screen.findByText("IN FLIGHT")).toBeTruthy();
  expect(screen.getByText(/100 × A5 · gloss paper · ₱400\.00/)).toBeTruthy();
  expect(screen.queryByText(/₱515\.00/)).toBeNull();
});
