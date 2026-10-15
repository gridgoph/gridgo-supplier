import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import AcceptJobScreen from "@/app/job/[id]/accept";
import RequestChangeScreen from "@/app/job/[id]/change";
import JobWorkspaceScreen from "@/app/job/[id]/index";
import type { Order } from "@/lib/api";
import { getOrder, requestOrderChange, transitionOrder } from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import { askConfirm } from "@/store/sheets";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => true),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  transitionOrder: jest.fn(),
  requestOrderChange: jest.fn(async () => ({})),
  getMyProductionLapses: jest.fn(async () => ({ lapses: [] })),
}));

const NOTE = "Staple each set on the top left. Call [masked] if unsure.";

function job(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "client_1",
    supplierId: "shop_1",
    riderId: null,
    state: "supplier_assigned",
    productId: "product_1",
    title: "Seminar handouts",
    quantity: 1,
    size: "A4",
    material: "Bond",
    deadline: null,
    readyBy: "2099-08-12T08:00:00+08:00",
    address: "Davao City",
    zone: "davao_central",
    totalMinor: 0,
    deliveryFeeMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
    supplierPriceMinor: 400000,
    payoutMilestones: [],
    timeline: [],
    productionItems: [
      {
        id: "line_1",
        itemName: "Document printing",
        quantity: 1,
        pricingUnit: "per_page",
        packageQty: null,
        measurement: { pages: 1200 },
        structuredSpec: {},
        options: [],
        artworkFileId: null,
        mockupFileId: null,
        specialInstructions: NOTE,
      },
    ],
    ...partial,
  };
}

afterEach(() => jest.clearAllMocks());

describe("accepting a job with special instructions", () => {
  it("shows the notes and will not accept until the shop ticks that it read them", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    (transitionOrder as jest.Mock).mockResolvedValue(job({ state: "payment_authorized" }));
    const view = await render(<AcceptJobScreen />);

    expect(await screen.findByText(NOTE)).toBeTruthy();
    const tick = screen.getByRole("checkbox", { name: "I've read the special instructions" });
    expect(tick.props.accessibilityState.checked).toBe(false);

    await fireEvent.press(screen.getByText("Accept job"));
    expect(screen.getByText("Tick that you read the special instructions to accept.")).toBeTruthy();
    expect(transitionOrder).not.toHaveBeenCalled();

    await fireEvent.press(tick);
    await fireEvent.press(screen.getByText("Accept job"));
    await waitFor(() =>
      expect(transitionOrder).toHaveBeenCalledWith(
        "ord_1",
        "payment_authorized",
        expect.objectContaining({ specialInstructionsRead: true }),
      ),
    );
    await view.unmount();
  });

  it("asks nothing more of a job without notes", async () => {
    const plain = job({ productionItems: [{ ...job().productionItems![0], specialInstructions: "" }] });
    (getOrder as jest.Mock).mockResolvedValue(plain);
    (transitionOrder as jest.Mock).mockResolvedValue({ ...plain, state: "payment_authorized" });
    const view = await render(<AcceptJobScreen />);

    expect(await screen.findByText("WHAT YOU ARE AGREEING TO")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await fireEvent.press(screen.getByText("Accept job"));
    await waitFor(() => expect(transitionOrder).toHaveBeenCalled());
    expect((transitionOrder as jest.Mock).mock.calls[0][2]).not.toHaveProperty("specialInstructionsRead");
    await view.unmount();
  });
});

describe("requesting a change", () => {
  async function fill() {
    await fireEvent.changeText(
      screen.getByLabelText("The change you will make"),
      "Staple twice on the left and add a clear cover.",
    );
    await fireEvent.changeText(screen.getByLabelText("Extra for your shop, in pesos"), "320");
    await fireEvent.changeText(screen.getByLabelText("Reason for the change"), "Covers are not in the listing price.");
  }

  it("names what is missing and sends nothing", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job({ state: "production" }));
    const view = await render(<RequestChangeScreen />);
    expect(await screen.findByText(NOTE)).toBeTruthy();

    await fireEvent.press(screen.getByText("Send request"));
    expect(screen.getByText("Say what you will do differently.")).toBeTruthy();
    expect(screen.getByText("Tell the client why the job needs this change.")).toBeTruthy();
    expect(requestOrderChange).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("sends the change, the shop's own extra in centavos and the reason, and replays the same key", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job({ state: "production" }));
    (requestOrderChange as jest.Mock).mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }));
    const view = await render(<RequestChangeScreen />);
    await screen.findByText(NOTE);
    await fill();

    await fireEvent.press(screen.getByText("Send request"));
    await waitFor(() => expect(requestOrderChange).toHaveBeenCalledTimes(1));
    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ question: "Ask the client to approve this change for ₱320.00 extra?" }),
    );
    expect(requestOrderChange).toHaveBeenCalledWith(
      "ord_1",
      {
        lineItemId: "line_1",
        reason: "Covers are not in the listing price.",
        proposedSpec: "Staple twice on the left and add a clear cover.",
        extraPrincipalMinor: 32000,
      },
      expect.stringMatching(/^change-/),
    );

    // The same request again is the same request to GRIDGO.
    await fireEvent.press(screen.getByText("Send request"));
    await waitFor(() => expect(requestOrderChange).toHaveBeenCalledTimes(2));
    const [first, second] = (requestOrderChange as jest.Mock).mock.calls;
    expect(second[2]).toBe(first[2]);
    await view.unmount();
  });

  it("says why a job cannot take a request, instead of a form", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job({ state: "ready_for_dispatch" }));
    const view = await render(<RequestChangeScreen />);
    expect(await screen.findByText("This job cannot take a request now")).toBeTruthy();
    expect(screen.queryByLabelText("The change you will make")).toBeNull();
    await view.unmount();
  });
});

describe("the job workspace", () => {
  it("puts the notes, the tick and the change request in front of the work", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "production",
        specialInstructionsAcknowledgement: { supplierId: "shop_1", at: "2026-10-15T07:25:00Z" },
        changeRequests: [
          {
            id: "change_1",
            lineItemId: "line_1",
            status: "pending_payment",
            version: 2,
            extraPrincipalMinor: 32000,
            reason: "Covers are not in the listing price.",
            proposedSpec: "Add a clear cover.",
            originalInstructions: NOTE,
          },
        ],
      }),
    );
    const view = await render(<JobWorkspaceScreen />);

    expect(await screen.findByTestId("special-instructions")).toBeTruthy();
    expect(screen.getByTestId("special-instructions-read")).toBeTruthy();
    expect(screen.getByText("Approved, waiting for payment")).toBeTruthy();
    expect(screen.getByText("₱320.00 extra for your shop if the client pays for the change.")).toBeTruthy();
    // One request at a time: nothing offers another while this one waits.
    expect(screen.queryByText("Costs more? Request a change")).toBeNull();
    expect(screen.queryByText("Request a new deadline")).toBeNull();
    await view.unmount();
  });
});
