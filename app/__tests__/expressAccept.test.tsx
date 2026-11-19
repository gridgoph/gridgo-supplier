import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import AcceptJobScreen from "@/app/job/[id]/accept";
import DeclineJobScreen from "@/app/job/[id]/decline";
import * as api from "@/lib/api";
import { askConfirm } from "@/store/sheets";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_x" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  acceptExpress: jest.fn(),
  declineExpress: jest.fn(),
}));
jest.mock("@/store/sheets", () => ({ ...jest.requireActual("@/store/sheets"), askConfirm: jest.fn() }));

const soon = () => new Date(Date.now() + 4 * 60_000).toISOString();
const offer = (note = "") =>
  ({
    id: "ord_x", title: "Express print", state: "supplier_assigned", timeline: [],
    clientId: "c", supplierId: "shop", riderId: null, productId: "p", quantity: 1, size: "", material: "",
    deadline: null, address: "", zone: "", totalMinor: 2500, deliveryFeeMinor: 0, paymentMethod: null,
    paymentStatus: "paid", promisedDate: null, artworkName: null,
    createdAt: "2026-11-19T02:00:00Z", updatedAt: "2026-11-19T02:00:00Z",
    supplierPriceMinor: 1800,
    orderType: "express", fulfillmentMode: "pickup",
    shopAcceptance: { assignedAt: new Date().toISOString(), deadlineAt: soon(), workingMinutes: 5, status: "pending" },
    productionItems: note ? [{ id: "l1", itemName: "Docs", specialInstructions: note }] : [],
    expressOrder: {
      status: "sending",
      printSettings: [{ fileId: "f1", pages: { total: 3, range: null, printed: 3 }, copies: 2, colour: "bw", paper: "a4", sides: "two", layout: "fit_to_paper", note }],
    },
  }) as unknown as api.Order;

beforeEach(() => jest.clearAllMocks());

it("shows the offer: clock, the shop's price, pages and what to print", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(offer());
  const view = await render(<AcceptJobScreen />);
  expect(await screen.findByTestId("express-offer")).toBeTruthy();
  expect(screen.getByText(api.formatPhp(1800))).toBeTruthy();
  // The client's total never reaches the shop's screen.
  expect(screen.queryByText(api.formatPhp(2500))).toBeNull();
  expect(screen.getByText("6")).toBeTruthy();
  for (const chip of ["3 pages", "× 2", "A4", "B&W", "2-sided", "Fit to page"]) expect(screen.getByText(chip)).toBeTruthy();
  await view.unmount();
});

it("accepts in one tap when there are no notes", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(offer());
  (api.acceptExpress as jest.Mock).mockResolvedValue(undefined);
  const view = await render(<AcceptJobScreen />);
  await fireEvent.press(await screen.findByText("Accept"));
  expect(api.acceptExpress).toHaveBeenCalledWith("ord_x", false);
  expect(router.back).toHaveBeenCalled();
  await view.unmount();
});

it("asks for the notes tick first when the client wrote notes", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(offer("Staple each copy"));
  (api.acceptExpress as jest.Mock).mockResolvedValue(undefined);
  const view = await render(<AcceptJobScreen />);
  await fireEvent.press(await screen.findByText("Accept"));
  expect(api.acceptExpress).not.toHaveBeenCalled();
  expect(screen.getByText("Tick that you read the notes to accept.")).toBeTruthy();
  await fireEvent.press(screen.getByText("I've read the notes"));
  await fireEvent.press(screen.getByText("Accept"));
  expect(api.acceptExpress).toHaveBeenCalledWith("ord_x", true);
  await view.unmount();
});

it("says time is up when GRIDGO answers that the five minutes ran out", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(offer());
  (api.acceptExpress as jest.Mock).mockRejectedValue(new api.ApiError(409, { error: "shop_acceptance_expired" }));
  const view = await render(<AcceptJobScreen />);
  await fireEvent.press(await screen.findByText("Accept"));
  expect(await screen.findByTestId("express-expired")).toBeTruthy();
  expect(screen.getByText("Back to jobs")).toBeTruthy();
  await view.unmount();
});

it("declines with a one-tap reason and says it went to the next shop", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(offer());
  (api.declineExpress as jest.Mock).mockResolvedValue(undefined);
  (askConfirm as jest.Mock).mockResolvedValue(true);
  const view = await render(<DeclineJobScreen />);
  await fireEvent.press(await screen.findByText("Decline"));
  expect(screen.getByText("Pick a reason.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Printer unavailable"));
  await fireEvent.press(screen.getByText("Decline"));
  expect(api.declineExpress).toHaveBeenCalledWith("ord_x", "Printer unavailable");
  expect(await screen.findByText("GRIDGO sent it to the next shop.")).toBeTruthy();
  await view.unmount();
});
