import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import CancelJobScreen from "@/app/job/[id]/cancel";
import DeclineJobScreen from "@/app/job/[id]/decline";
import JobWorkspaceScreen from "@/app/job/[id]/index";
import type { Order, ShopAcceptance } from "@/lib/api";
import { cancelJob, declineJob, getOrder } from "@/lib/api";
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
  declineJob: jest.fn(async () => undefined),
  cancelJob: jest.fn(async () => undefined),
  getMyProductionLapses: jest.fn(async () => ({ lapses: [] })),
  getFile: jest.fn(async (fileId: string) => ({ fileId, detectedContentType: "image/jpeg" })),
  getDownloadUrl: jest.fn(async (fileId: string) => ({
    fileId,
    url: `https://example.test/${fileId}.jpg`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  })),
}));

const MINUTE = 60_000;

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
    deadline: "2099-08-12T10:00:00+08:00",
    readyBy: "2099-08-12T08:00:00+08:00",
    address: "Davao",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    payoutMilestones: [],
    payoutHold: false,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

function pendingWindow(assignedMinutesAgo: number, spanMinutes = 60): ShopAcceptance {
  const assigned = Date.now() - assignedMinutesAgo * MINUTE;
  return {
    assignedAt: new Date(assigned).toISOString(),
    deadlineAt: new Date(assigned + spanMinutes * MINUTE).toISOString(),
    workingMinutes: 60,
    status: "pending",
  };
}

afterEach(() => jest.clearAllMocks());

describe("a new job's hour to answer", () => {
  it("counts down above Accept and Decline", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({ state: "supplier_assigned", shopAcceptance: pendingWindow(10) }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByTestId("accept-window")).toBeTruthy();
    expect(screen.getByText("Time left to accept or decline")).toBeTruthy();
    expect(screen.getByText(/^(49|50):\d\d$/)).toBeTruthy();
    expect(screen.getByText("Accept job")).toBeTruthy();
    expect(screen.getByText("Decline job")).toBeTruthy();
  });

  it("says the hour pauses when it reaches past closing time", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({ state: "supplier_assigned", shopAcceptance: pendingWindow(10, 15 * 60) }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("Pauses while you are closed")).toBeTruthy();
    expect(screen.getByText("Accept or decline by")).toBeTruthy();
    expect(screen.queryByText("Time left to accept or decline")).toBeNull();
  });

  it("takes Accept and Decline away once the hour has run out", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({ state: "supplier_assigned", shopAcceptance: pendingWindow(61) }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("The hour to answer has run out")).toBeTruthy();
    expect(screen.queryByText("Accept job")).toBeNull();
    expect(screen.queryByText("Decline job")).toBeNull();
  });
});

describe("a job the shop let go", () => {
  it("says the client is choosing and offers no step", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "production",
        shopAcceptance: { ...pendingWindow(500), status: "cancelled" },
        shopRecovery: { id: "shop_event_1", status: "awaiting_client" },
      }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByTestId("shop-release")).toBeTruthy();
    expect(screen.getByText("You cancelled this job")).toBeTruthy();
    expect(screen.getAllByText("Cancelled by you").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("job-action-bar")).toBeNull();
    expect(screen.queryByText("Cancel this job")).toBeNull();
    expect(screen.queryByText("Request a new deadline")).toBeNull();
  });
});

describe("cancelling an accepted job", () => {
  it("is offered from a job in production, under the trouble heading", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("RUNNING INTO TROUBLE?")).toBeTruthy();
    expect(screen.getByText("Cancel this job")).toBeTruthy();
  });

  it("warns about the record and unpaid earnings, and needs a reason", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<CancelJobScreen />);
    expect(await screen.findByText("This counts on your shop's record")).toBeTruthy();
    expect(screen.getByText(/during production/)).toBeTruthy();
    expect(screen.getByText(/not been released will not be paid/)).toBeTruthy();

    await fireEvent.press(screen.getByText("Cancel job"));
    expect(await screen.findByText("Pick the reason that fits closest.")).toBeTruthy();
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it("asks for the shop's own words when the reason is 'Something else'", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<CancelJobScreen />);
    await fireEvent.press(await screen.findByText("Something else"));
    await fireEvent.press(screen.getByText("Cancel job"));
    expect(await screen.findByText("Say what happened, in a sentence.")).toBeTruthy();
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it("confirms with the job named, then sends the reason", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<CancelJobScreen />);
    await fireEvent.press(await screen.findByText("A machine broke down"));
    await fireEvent.press(screen.getByText("Cancel job"));
    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith("ord_1", "A machine broke down"));
    expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ question: "Cancel Barangay tarpaulin?" }));
    expect(await screen.findByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("It is on your shop's record")).toBeTruthy();
  });

  it("does not send when the shop keeps the job", async () => {
    (askConfirm as jest.Mock).mockResolvedValueOnce(false);
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<CancelJobScreen />);
    await fireEvent.press(await screen.findByText("A machine broke down"));
    await fireEvent.press(screen.getByText("Cancel job"));
    await waitFor(() => expect(askConfirm).toHaveBeenCalled());
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it("says Operations decides when part of the money already reached the shop", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        payoutMilestones: [
          {
            code: "production_started",
            sharePercent: 40,
            amountMinor: 40000,
            status: "released",
            pofFileIds: ["f"],
            releasedAt: "2026-10-01T00:00:00Z",
          },
        ],
      }),
    );
    await render(<CancelJobScreen />);
    expect(await screen.findByText(/Operations decides what happens next/)).toBeTruthy();
  });
});

describe("declining a new job", () => {
  it("sends the reason to the decline route and says it is on the record", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({ state: "supplier_assigned", shopAcceptance: pendingWindow(5) }),
    );
    await render(<DeclineJobScreen />);
    await fireEvent.press(await screen.findByText("Capacity is full for this date"));
    await fireEvent.press(screen.getByText("Decline job"));
    await waitFor(() =>
      expect(declineJob).toHaveBeenCalledWith("ord_1", "Declined — shop capacity is full for the requested date"),
    );
    expect(await screen.findByText(/on your shop's record as passed on/)).toBeTruthy();
  });
});
