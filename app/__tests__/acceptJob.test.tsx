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

it("puts the shop's own pay and ready-by date above the instructions it must tick", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue({
    ...job,
    totalMinor: 150000,
    supplierPriceMinor: 100000,
    readyBy: "2026-11-03T10:00:00+08:00",
    productionItems: [{ name: "Flyers", quantity: 1, specialInstructions: "Keep the pages in order." }],
  });
  const view = await render(<AcceptJobScreen />);
  const commitment = await screen.findByTestId("accept-commitment");
  expect(screen.getByText("You earn")).toBeTruthy();
  // The shop's price, never the client's total.
  expect(screen.getAllByText(api.formatPhp(100000)).length).toBeGreaterThan(0);
  expect(screen.queryByText(api.formatPhp(150000))).toBeNull();
  expect(screen.getByText("Ready by")).toBeTruthy();
  // Drawn before the tick the shop owes, so the commitment is read first.
  const tree = JSON.stringify(view.toJSON());
  expect(tree.indexOf("You earn")).toBeLessThan(tree.indexOf("I've read the special instructions"));
  expect(commitment).toBeTruthy();
  await view.unmount();
});
