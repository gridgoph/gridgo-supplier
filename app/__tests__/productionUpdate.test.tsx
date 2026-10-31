import { act, fireEvent, render, screen } from "@testing-library/react-native";
import AdvanceJobScreen from "@/app/job/[id]/advance";
import * as api from "@/lib/api";
import { useJobDrafts } from "@/store/jobDrafts";

const mockBack = jest.fn();
// The last props the primary action drew with, so a test can tap it twice in one frame.
let mockPrimary: { label: string; onPress: () => void } | null = null;
jest.mock("@/components/PrimaryButton", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    PrimaryButton: (props: { label: string; onPress: () => void }) => {
      mockPrimary = props;
      return <Text>{props.label}</Text>;
    },
  };
});
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ id: "ord_1", action: "start_production" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  transitionOrder: jest.fn(),
}));

const job: api.Order = {
  id: "ord_1", title: "Print job", state: "payment_authorized", timeline: [],
  clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
  quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
  address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
  paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
  supplierPriceMinor: 100000, payoutMilestones: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  useJobDrafts.getState().clearDraft("ord_1");
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  (api.transitionOrder as jest.Mock).mockResolvedValue({ ...job, state: "production" });
});

it("says the consequence once, as the exact note beside Start production", async () => {
  const view = await render(<AdvanceJobScreen />);
  const preview = await screen.findByTestId("timeline-preview");
  expect(preview).toBeTruthy();
  expect(screen.getByText("“Production started — job is queued on the press”")).toBeTruthy();
  // The old repeats are gone: no lede, no hint under the choice, no "After this step".
  expect(screen.queryByText(/The client sees production has started/)).toBeNull();
  expect(screen.queryByText(/This is the headline the client reads/)).toBeNull();
  expect(screen.queryByText(/After this step the job reads/)).toBeNull();
  await view.unmount();
});

it("previews the note it sends, template and the shop's own words, and sends it once", async () => {
  const view = await render(<AdvanceJobScreen />);
  await screen.findByTestId("timeline-preview");
  await fireEvent.press(screen.getByText("Printing"));
  await fireEvent.changeText(screen.getByLabelText("Note for the client"), "Trimming tomorrow");
  const note = "Production started — printing now. Trimming tomorrow";
  expect(screen.getByText(`“${note}”`)).toBeTruthy();

  // Two taps in the same frame, before the button re-renders disabled.
  expect(mockPrimary?.label).toBe("Start production");
  const { onPress } = mockPrimary!;
  await act(async () => {
    onPress();
    onPress();
  });
  expect(api.transitionOrder).toHaveBeenCalledTimes(1);
  expect(api.transitionOrder).toHaveBeenCalledWith("ord_1", "production", { note });
  expect(mockBack).toHaveBeenCalled();
  await view.unmount();
});
