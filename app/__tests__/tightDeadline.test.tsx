import { fireEvent, render, screen } from "@testing-library/react-native";
import AcceptJobScreen from "@/app/job/[id]/accept";
import DeclineJobScreen from "@/app/job/[id]/decline";
import * as api from "@/lib/api";
import { NO_MONEY_TAKEN } from "@/lib/performance";
import { TIGHT_DECLINE_NO_PENALTY, TIGHT_DEADLINE_LINE } from "@/lib/scheduling";
import { askConfirm } from "@/store/sheets";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getOrder: jest.fn(), declineJob: jest.fn() }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn() }));

const job: api.Order = {
  id: "ord_1", title: "Print job", state: "supplier_assigned", timeline: [],
  clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
  quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
  address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
  paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
  supplierPriceMinor: 100000, payoutMilestones: [], readyBy: "2026-10-23T07:00:00.000Z",
};
const tight: api.Order = {
  ...job,
  scheduling: { status: "tight", sameDay: false, tightDeadline: true, label: "Tight deadline" },
};

beforeEach(() => jest.clearAllMocks());

it("says Tight deadline before the shop accepts, with the way to decline", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(tight);
  const view = await render(<AcceptJobScreen />);
  expect(await screen.findByText("Tight deadline")).toBeTruthy();
  expect(screen.getByText(TIGHT_DEADLINE_LINE)).toBeTruthy();
  expect(screen.getByText("Too tight? Decline with a reason")).toBeTruthy();
  await view.unmount();
});

const DEDUCTION_LINE = /leads to a deduction from what GRIDGO still owes you/;

it("promises a Tight job no money is taken, in the Performance page's words", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(tight);
  const view = await render(<AcceptJobScreen />);
  expect(await screen.findByText(NO_MONEY_TAKEN)).toBeTruthy();
  expect(screen.queryByText(DEDUCTION_LINE)).toBeNull();
  expect(screen.getByText("How late production is handled")).toBeTruthy();
  await view.unmount();
});

it("keeps the deduction sentence on a job that is not Tight", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  const view = await render(<AcceptJobScreen />);
  expect(await screen.findByText(DEDUCTION_LINE)).toBeTruthy();
  expect(screen.queryByText(NO_MONEY_TAKEN)).toBeNull();
  await view.unmount();
});

it("draws no badge for an older GRIDGO without scheduling", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  const view = await render(<AcceptJobScreen />);
  expect(await screen.findByText("WHAT YOU ARE AGREEING TO")).toBeTruthy();
  expect(screen.queryByText("Tight deadline")).toBeNull();
  expect(screen.queryByText("Too tight? Decline with a reason")).toBeNull();
  await view.unmount();
});

it("still requires a reason to decline a Tight job and says there is no penalty", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(tight);
  (askConfirm as jest.Mock).mockResolvedValue(true);
  const view = await render(<DeclineJobScreen />);
  expect(await screen.findByText(new RegExp(TIGHT_DECLINE_NO_PENALTY.replace(/[.]/g, "\\.")))).toBeTruthy();
  expect(screen.queryByText(/Three declines within 30 days/)).toBeNull();

  await fireEvent.press(screen.getAllByText("Decline job").at(-1)!);
  expect(await screen.findByText("Pick the reason that fits closest.")).toBeTruthy();
  expect(api.declineJob).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText("We cannot finish by the deadline"));
  await fireEvent.press(screen.getAllByText("Decline job").at(-1)!);
  expect(askConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ consequence: expect.stringContaining("does not count against your shop") }),
  );
  expect(api.declineJob).toHaveBeenCalledWith("ord_1", "Declined — deadline cannot be met", "deadline_unachievable");
  expect(await screen.findByText(/does not count against your shop during the pilot/)).toBeTruthy();
  await view.unmount();
});

it("keeps the ordinary record warning when the job is not Tight", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  const view = await render(<DeclineJobScreen />);
  expect(await screen.findByText(/Three declines within 30 days/)).toBeTruthy();
  await view.unmount();
});
