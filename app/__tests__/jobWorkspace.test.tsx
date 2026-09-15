import { act, render, screen, waitFor, within } from "@testing-library/react-native";

import JobWorkspaceScreen from "@/app/job/[id]/index";
import type { MilestoneCode, Order, PayoutMilestone } from "@/lib/api";
import { getFile, getOrder } from "@/lib/api";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    originalFilename: `${fileId}.jpg`,
    detectedContentType: fileId === "file_pdf" ? "application/pdf" : "image/jpeg",
    declaredContentType: "image/jpeg",
  })),
  getDownloadUrl: jest.fn(async (fileId: string) => ({
    fileId,
    url: `https://example.test/${fileId}.jpg`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  })),
}));

const SHARES: Record<MilestoneCode, number> = {
  printing: 50,
  packaging_qc: 15,
  delivered: 25,
  retention: 10,
};

function milestones(
  status: Partial<Record<MilestoneCode, PayoutMilestone["status"]>> = {},
  files: Partial<Record<MilestoneCode, string[]>> = {},
): PayoutMilestone[] {
  return (Object.keys(SHARES) as MilestoneCode[]).map((code) => ({
    code,
    sharePercent: SHARES[code],
    amountMinor: Math.round((100000 * SHARES[code]) / 100),
    status: status[code] ?? "pending_pof",
    pofFileIds: files[code] ?? [],
    releasedAt: null,
  }));
}

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
    deadline: "2026-08-12T10:00:00+08:00",
    address: "Davao",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    payoutMilestones: milestones(),
    payoutHold: false,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("job workspace proof photos", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each(["file_print", "file_pdf"])("retries failed metadata for %s on pull-to-refresh", async (fileId) => {
    (getOrder as jest.Mock).mockResolvedValue(job({
      payoutMilestones: milestones({ printing: "pof_attached" }, { printing: [fileId] }),
    }));
    (getFile as jest.Mock).mockRejectedValueOnce(new Error("Offline"));
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("This evidence will not load")).toBeTruthy();

    const [scroll] = screen.container.queryAll((node) => node.props.refreshControl != null);
    await act(async () => { scroll.props.refreshControl.props.onRefresh(); });

    if (fileId === "file_pdf") {
      expect(await screen.findByText("PDF")).toBeTruthy();
      expect(screen.queryByLabelText("Printing evidence")).toBeNull();
    } else {
      await waitFor(() => expect(screen.getByLabelText("Printing evidence").props.source).toEqual({
        uri: `https://example.test/${fileId}.jpg`,
      }));
    }
    expect(screen.queryByText("This evidence will not load")).toBeNull();
    expect(getFile).toHaveBeenCalledTimes(2);
    expect(getOrder).toHaveBeenCalledTimes(3);
  });

  it("shows filed shop proof photographs after the job reloads", async () => {
    (getOrder as jest.Mock)
      .mockResolvedValueOnce(job())
      .mockResolvedValue(
        job({
          payoutMilestones: milestones(
            { printing: "pof_attached" },
            { printing: ["file_print"] },
          ),
        }),
      );

    await render(<JobWorkspaceScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Printing evidence").props.source).toEqual({
        uri: "https://example.test/file_print.jpg",
      });
    });
    expect(getOrder).toHaveBeenCalledTimes(2);
  });
});

describe("job workspace docket and pinned step", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("folds the offer into one docket and pins the decision under the page", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "supplier_assigned",
        readyBy: "2026-09-20T17:00:00+08:00",
        artworkFileIds: ["file_print"],
        mockupFileIds: ["file_mock"],
        timeline: [{ at: "2026-09-15T01:00:00.000Z", state: "supplier_assigned", by: "system", note: "Offered" }],
      }),
    );

    await render(<JobWorkspaceScreen />);

    expect(await screen.findByTestId("job-brief")).toBeTruthy();
    expect(screen.getByTestId("job-brief-make")).toBeTruthy();
    expect(screen.getByText("1 print file")).toBeTruthy();
    expect(screen.getByText("1 reference picture")).toBeTruthy();
    expect(screen.getByText("1 update")).toBeTruthy();

    const bar = screen.getByTestId("job-action-bar");
    expect(within(bar).getByLabelText("Accept job")).toBeTruthy();
    expect(within(bar).getByText("Decline job")).toBeTruthy();
    expect(screen.queryByText("Open pickup handoff")).toBeNull();
  });

  it("opens the money row once the shop owes evidence, and pins the proof step", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({ state: "production", payoutMilestones: milestones({ printing: "pof_attached" }) }),
    );

    await render(<JobWorkspaceScreen />);

    expect(await screen.findByTestId("job-brief-earnings")).toBeTruthy();
    expect(screen.queryByTestId("job-brief-make")).toBeNull();
    expect(screen.getByText("₱150.00 waiting on your proof")).toBeTruthy();
    const bar = screen.getByTestId("job-action-bar");
    expect(within(bar).getByLabelText("Add packaging proof")).toBeTruthy();
    expect(within(bar).getByText("Package for pickup")).toBeTruthy();
  });

  it("adds the pickup row while a package waits at the counter and offers the handoff", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "ready_for_dispatch",
        payoutMilestones: milestones({ printing: "pof_attached", packaging_qc: "pof_attached" }),
      }),
    );

    await render(<JobWorkspaceScreen />);

    expect(await screen.findByTestId("job-brief-handoff")).toBeTruthy();
    expect(screen.getByText("Waiting on a rider")).toBeTruthy();
    expect(within(screen.getByTestId("job-action-bar")).getByText("Open pickup handoff")).toBeTruthy();
  });

  it("draws no bar and says whose move it is when the shop has nothing to do", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "delivered",
        payoutMilestones: milestones({
          printing: "released",
          packaging_qc: "released",
          delivered: "pof_attached",
        }),
      }),
    );

    await render(<JobWorkspaceScreen />);

    expect((await screen.findAllByText(/window to report a problem/)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("job-action-bar")).toBeNull();
    expect(screen.getByText("₱650.00 released of ₱1,000.00")).toBeTruthy();
  });
});
