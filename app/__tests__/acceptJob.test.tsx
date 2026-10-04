import { render, screen } from "@testing-library/react-native";
import AcceptJobScreen from "@/app/job/[id]/accept";
import * as api from "@/lib/api";
import { NO_SUBCONTRACTING_ACCEPT_LINE } from "@/lib/supplierTerms";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getOrder: jest.fn() }));

const job: api.Order = {
  id: "ord_1", title: "Print job", state: "supplier_assigned", timeline: [],
  clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
  quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
  address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
  paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
  supplierPriceMinor: 100000, payoutMilestones: [],
};

it("states the no-subcontracting term in one line under what the shop agrees to", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  const view = await render(<AcceptJobScreen />);
  expect(await screen.findByText("WHAT YOU ARE AGREEING TO")).toBeTruthy();
  expect(screen.getByText(NO_SUBCONTRACTING_ACCEPT_LINE)).toBeTruthy();
  await view.unmount();
});
