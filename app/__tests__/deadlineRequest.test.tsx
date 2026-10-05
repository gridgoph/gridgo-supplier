import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import JobWorkspaceScreen from "@/app/job/[id]/index";
import RequestDeadlineScreen from "@/app/job/[id]/reschedule";
import type { Order, RescheduleRequest } from "@/lib/api";
import { ApiError, getMyProductionLapses, getOrder, requestNewDeadline } from "@/lib/api";
import { askConfirm, askDate } from "@/store/sheets";
import { router } from "expo-router";

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
  askDate: jest.fn(),
}));

// gridgo-api#152 (deadline requests) is not merged; its documented shapes are mocked here.
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  requestNewDeadline: jest.fn(),
  getMyProductionLapses: jest.fn(async () => ({ lapses: [] })),
  getFile: jest.fn(async (fileId: string) => ({ fileId, detectedContentType: "image/jpeg" })),
  getDownloadUrl: jest.fn(async (fileId: string) => ({
    fileId,
    url: `https://example.test/${fileId}.jpg`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  })),
}));

const READY_BY = "2099-08-12T00:00:00.000Z";
const PROPOSED = "2099-08-14T00:00:00.000Z";

function job(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    productId: "prod_tarpaulin",
    title: "Barangay tarpaulin",
    quantity: 1,
    size: "3x5 ft",
    material: "13oz tarpaulin",
    deadline: "2099-08-13T00:00:00.000Z",
    readyBy: READY_BY,
    address: "Davao",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    payoutMilestones: [],
    payoutHold: false,
    promisedDate: READY_BY,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

function request(partial: Partial<RescheduleRequest> = {}): RescheduleRequest {
  return {
    id: "resched_1",
    orderId: "ord_1",
    reason: "Laminator broke down",
    status: "pending",
    requestedAt: "2099-08-10T00:00:00.000Z",
    expiresAt: "2099-08-11T00:00:00.000Z",
    answeredAt: null,
    resolution: null,
    workHeld: false,
    originalReadyBy: READY_BY,
    proposedReadyBy: PROPOSED,
    ...partial,
  };
}

afterEach(() => jest.clearAllMocks());

describe("the deadline request on a job", () => {
  it("is offered on a job in production that has not asked yet", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("Request a new deadline")).toBeTruthy();
    expect(screen.getByText(/You can ask the client once on this job/)).toBeTruthy();
  });

  it("is not offered before production", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job({ state: "payment_authorized" }));
    await render(<JobWorkspaceScreen />);
    // Cancelling is still offered here, so the trouble heading is drawn.
    expect(await screen.findByText("RUNNING INTO TROUBLE?")).toBeTruthy();
    expect(screen.queryByText("Request a new deadline")).toBeNull();
  });

  it.each([
    ["pending", null, "Waiting for the client"],
    ["accepted", null, "Accepted"],
    ["expired", null, "Not answered"],
    ["operations_required", "operations_required", "With Operations"],
  ] as const)("shows a %s request once, with no second ask", async (status, resolution, chip) => {
    (getOrder as jest.Mock).mockResolvedValue(job({ rescheduleRequest: request({ status, resolution }) }));
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByTestId("deadline-request")).toBeTruthy();
    expect(screen.getByText(chip)).toBeTruthy();
    expect(screen.getByText("Laminator broke down")).toBeTruthy();
    expect(screen.queryByText("Request a new deadline")).toBeNull();
  });

  it("pauses the job when the client declines", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({ rescheduleRequest: request({ status: "declined", resolution: "rematch_offered", workHeld: true }) }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("The client declined the new deadline")).toBeTruthy();
    expect(screen.getByText("Declined")).toBeTruthy();
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("job-action-bar")).toBeNull();
    expect(screen.queryByText("Cancel this job")).toBeNull();
  });
});

describe("a late job that is held", () => {
  const severe = {
    lapses: [
      { id: "lapse_1", orderId: "ord_1", tier: "severe", rateBps: 3000, status: "warned", deadlineAt: READY_BY,
        detectedAt: "2099-08-12T01:00:00.000Z", reassignmentEligible: true },
    ],
  };

  it("keeps the late card but does not tell a paused shop to finish the job", async () => {
    (getMyProductionLapses as jest.Mock).mockResolvedValueOnce(severe);
    (getOrder as jest.Mock).mockResolvedValue(
      job({ rescheduleRequest: request({ status: "declined", resolution: "rematch_offered", workHeld: true }) }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByTestId("lateness-notice")).toBeTruthy();
    expect(screen.getByText(/^Work on this job is on hold, so there is nothing to finish for now/)).toBeTruthy();
    expect(screen.queryByText(/Finish the job and mark it ready/)).toBeNull();
  });

  it("draws no late card on a job the shop let go", async () => {
    (getMyProductionLapses as jest.Mock).mockResolvedValueOnce(severe);
    (getOrder as jest.Mock).mockResolvedValue(job({ shopRecovery: { id: "rec_1", status: "awaiting_client" } }));
    await render(<JobWorkspaceScreen />);
    await waitFor(() => expect(getMyProductionLapses).toHaveBeenCalled());
    expect(await screen.findByText(/Leave the job as it is/)).toBeTruthy();
    expect(screen.queryByTestId("lateness-notice")).toBeNull();
    expect(screen.queryByText(/Finish the job and mark it ready/)).toBeNull();
  });
});

describe("asking the client for a new deadline", () => {
  it("needs a later time and a reason before it sends", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<RequestDeadlineScreen />);
    expect(await screen.findByText("Your ready-by now")).toBeTruthy();
    await fireEvent.press(screen.getByText("Send request"));
    expect(await screen.findByText("Choose the new date and time.")).toBeTruthy();
    expect(screen.getByText("Tell the client why the job needs more time.")).toBeTruthy();
    expect(requestNewDeadline).not.toHaveBeenCalled();
  });

  it("confirms it is the only ask, then sends the date with its timezone", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    (askDate as jest.Mock).mockResolvedValue(new Date(PROPOSED));
    (requestNewDeadline as jest.Mock).mockResolvedValue({ request: request() });
    await render(<RequestDeadlineScreen />);
    await fireEvent.press(await screen.findByLabelText("New ready-by date and time"));
    await fireEvent.changeText(screen.getByLabelText("Reason for the new deadline"), "Laminator broke down");
    await fireEvent.press(screen.getByText("Send request"));
    await waitFor(() =>
      expect(requestNewDeadline).toHaveBeenCalledWith("ord_1", {
        reason: "Laminator broke down",
        proposedReadyBy: PROPOSED,
      }),
    );
    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ consequence: expect.stringMatching(/only once/) }),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it("says plainly when this connection does not take requests yet", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    (askDate as jest.Mock).mockResolvedValue(new Date(PROPOSED));
    (requestNewDeadline as jest.Mock).mockRejectedValue(new ApiError(404, { error: "not_found" }));
    await render(<RequestDeadlineScreen />);
    await fireEvent.press(await screen.findByLabelText("New ready-by date and time"));
    await fireEvent.changeText(screen.getByLabelText("Reason for the new deadline"), "Laminator broke down");
    await fireEvent.press(screen.getByText("Send request"));
    expect(await screen.findByText(/not taking deadline requests on this connection yet/)).toBeTruthy();
  });

  it("names the refusal when the job already has its one request", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    (askDate as jest.Mock).mockResolvedValue(new Date(PROPOSED));
    (requestNewDeadline as jest.Mock).mockRejectedValue(
      new ApiError(409, { error: "reschedule_already_requested" }),
    );
    await render(<RequestDeadlineScreen />);
    await fireEvent.press(await screen.findByLabelText("New ready-by date and time"));
    await fireEvent.changeText(screen.getByLabelText("Reason for the new deadline"), "Laminator broke down");
    await fireEvent.press(screen.getByText("Send request"));
    expect(await screen.findByText(/already has its one deadline request/)).toBeTruthy();
  });

  it("does not offer the form on a job that already asked", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job({ rescheduleRequest: request() }));
    await render(<RequestDeadlineScreen />);
    expect(await screen.findByText("This job cannot take a request now")).toBeTruthy();
    expect(screen.queryByText("Send request")).toBeNull();
  });
});
