import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

import JobWorkspaceScreen from "@/app/job/[id]/index";
import type { MilestoneCode, Order, PayoutMilestone } from "@/lib/api";
import { getFile, getMyProductionLapses, getOrder } from "@/lib/api";

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
  getMyProductionLapses: jest.fn(async () => ({ lapses: [] })),
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

/** Plan 2, the escrow split, exactly as gridgo-api serves it. */
function escrow(
  status: Partial<Record<MilestoneCode, PayoutMilestone["status"]>> = {},
  files: Partial<Record<MilestoneCode, string[]>> = {},
): PayoutMilestone[] {
  const stages = [
    { code: "production_started", label: "Start of production", sharePercent: 40, releaseRequires: "shop_proof" },
    { code: "delivered", label: "Delivered", sharePercent: 35, releaseRequires: "delivery_proof" },
    { code: "issue_window", label: "Issue window closed", sharePercent: 25, releaseRequires: "issue_window_closed" },
  ] as const;
  return stages.map((stage) => ({
    ...stage,
    amountMinor: stage.sharePercent * 1000,
    status: status[stage.code] ?? "pending_pof",
    pofFileIds: files[stage.code] ?? [],
    releasedAt: status[stage.code] === "released" ? "2026-09-26T02:00:00.000Z" : null,
  }));
}

describe("job workspace on the escrow plan", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("asks for the start-of-production proof and opens it against production_started", async () => {
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>("expo-router");
    (getOrder as jest.Mock).mockResolvedValue(
      job({ state: "production", payoutPlanVersion: 2, payoutMilestones: escrow() }),
    );

    await render(<JobWorkspaceScreen />);

    expect(await screen.findByTestId("job-brief-earnings")).toBeTruthy();
    expect(screen.getByText("₱400.00 waiting on your proof")).toBeTruthy();
    expect(screen.getByText("Start of production")).toBeTruthy();
    expect(screen.getByText("Issue window closed")).toBeTruthy();
    expect(screen.queryByText(/Printing|Packaging|Retention/)).toBeNull();

    const bar = screen.getByTestId("job-action-bar");
    const add = within(bar).getByLabelText("Add start-of-production proof");
    await fireEvent.press(add);
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/job/[id]/fulfilment",
      params: { id: "ord_1", action: "add_proof", milestone: "production_started" },
    });
  });

  it("shows the filed start photo and says whose move the rest is after delivery", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "issue_window_open",
        payoutPlanVersion: 2,
        payoutMilestones: escrow(
          { production_started: "released", delivered: "pof_attached" },
          { production_started: ["file_start"], delivered: ["file_rider"] },
        ),
      }),
    );

    await render(<JobWorkspaceScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Start of production evidence").props.source).toEqual({
        uri: "https://example.test/file_start.jpg",
      });
    });
    expect(screen.queryByLabelText("Delivered evidence")).toBeNull();
    expect(screen.queryByTestId("job-action-bar")).toBeNull();
    expect(screen.getByText("Window open")).toBeTruthy();
    expect(screen.getByText("₱400.00 released of ₱1,000.00")).toBeTruthy();
    expect(screen.queryByText(/retention/i)).toBeNull();
  });
});


describe("job workspace after a failed counter check", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const blocked = () =>
    job({
      state: "rider_assigned",
      riderId: "user_rider",
      payoutMilestones: escrow({ production_started: "released" }, { production_started: ["file_start"] }),
      payoutPlanVersion: 2,
      pickupCountItems: [{ lineItemId: "cline_1", itemName: "3x5 tarpaulin", expectedQuantity: 4 }],
      pickupChecklist: {
        status: "failed_escalated",
        checks: [
          { code: "quantity_match", passed: false },
          { code: "specification_match", passed: true },
          { code: "visible_defects", passed: false },
          { code: "packaging_integrity", passed: true },
          { code: "documentation", passed: true },
          { code: "supplier_sign_off", passed: true },
        ],
        counts: [{ lineItemId: "cline_1", expectedQuantity: 4, countedQuantity: 3 }],
        failureNote: "One tarp missing, another has a torn grommet.",
        completedAt: "2026-09-27T06:14:00.000Z",
        completedBy: "user_rider",
        escalationId: "esc_1",
        handoffSignature: null,
      },
    });

  it("says what failed, the count and the rider's note, with no payout action", async () => {
    (getOrder as jest.Mock).mockResolvedValue(blocked());

    await render(<JobWorkspaceScreen />);

    const panel = await screen.findByTestId("counter-check");
    expect(within(panel).getByText("Fix it with Operations; the rider will check again")).toBeTruthy();
    expect(within(panel).getByText("Count against the order")).toBeTruthy();
    expect(within(panel).getByText("Free of visible defects")).toBeTruthy();
    expect(within(panel).getByText("1 short")).toBeTruthy();
    expect(within(panel).getByText("“One tarp missing, another has a torn grommet.”")).toBeTruthy();
    expect(screen.getAllByText("Pickup blocked").length).toBeGreaterThan(0);
    // Nothing on the job asks the shop to file or release money over it.
    expect(screen.queryByText(/Add .* proof/)).toBeNull();
    expect(screen.queryByText("Report a problem with this job")).toBeNull();
  });

  it("opens a message to Operations about this job", async () => {
    const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };
    (getOrder as jest.Mock).mockResolvedValue(blocked());

    await render(<JobWorkspaceScreen />);
    fireEvent.press(await screen.findByText("Message Operations"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/report",
      params: { orderId: "ord_1", title: "Barangay tarpaulin" },
    });
  });
});

describe("job workspace after a client refund", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function escrowStages(
    status: Record<string, PayoutMilestone["status"]>,
  ): PayoutMilestone[] {
    return [
      { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40 },
      { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35 },
      { code: "issue_window", label: "Issue window closed", releaseRequires: "issue_window_closed", sharePercent: 25 },
    ].map((stage) => ({
      ...stage,
      releaseRequires: stage.releaseRequires as PayoutMilestone["releaseRequires"],
      amountMinor: stage.sharePercent * 1000,
      status: status[stage.code],
      pofFileIds: stage.code === "production_started" ? ["file_start"] : [],
      releasedAt: status[stage.code] === "released" ? "2026-09-26T02:00:00.000Z" : null,
      receiptFileId: status[stage.code] === "released" ? "file_stage_receipt" : null,
      reference: status[stage.code] === "released" ? "GC-400" : null,
    }));
  }

  it("stops the job while a refund is requested, with no step to take", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "production",
        payoutPlanVersion: 2,
        payoutMilestones: escrowStages({
          production_started: "pending_pof",
          delivered: "pending_pof",
          issue_window: "pending_pof",
        }),
        refundHold: true,
        refundDisposition: null,
      }),
    );

    await render(<JobWorkspaceScreen />);

    const panel = await screen.findByTestId("refund-notice");
    expect(within(panel).getByText("Work is paused for a refund review")).toBeTruthy();
    expect(screen.getByText("Paused for refund")).toBeTruthy();
    expect(screen.queryByTestId("job-action-bar")).toBeNull();
    expect(screen.queryByText("Add start-of-production proof")).toBeNull();
    expect(screen.getAllByText("Paused").length).toBe(3);
  });

  it("shows replaced stages as not paid, and the settlement payout with its transfer evidence", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        state: "cancelled",
        payoutPlanVersion: 2,
        payoutMilestones: escrowStages({
          production_started: "released",
          delivered: "superseded",
          issue_window: "superseded",
        }),
        refundHold: false,
        refundDisposition: "cancelled",
        supplierSettlementPayouts: [
          {
            id: "rspay_1",
            settlementId: "rsettle_1",
            orderId: "ord_1",
            amountMinor: 20000,
            status: "released",
            reference: "SHOP-200",
            receiptFileId: "file_payout_receipt",
            releasedAt: "2026-09-28T06:00:00.000Z",
            createdAt: "2026-09-28T04:20:00.000Z",
            code: "refund_settlement",
            label: "Agreed refund settlement payout",
          },
        ],
        timeline: [
          {
            at: "2026-09-28T04:20:00.000Z",
            state: "cancelled",
            by: "user_ops",
            note: "Refund settlement approved; no client transfer recorded yet.",
          },
        ],
      }),
    );

    await render(<JobWorkspaceScreen />);

    const panel = await screen.findByTestId("refund-notice");
    expect(within(panel).getByText("Settled and closed")).toBeTruthy();
    expect(within(panel).getByText(/You keep ₱600\.00 in total/)).toBeTruthy();
    expect(screen.getByText("Cancelled and settled")).toBeTruthy();
    expect(screen.queryByTestId("job-action-bar")).toBeNull();

    const earnings = screen.getByTestId("job-brief-earnings");
    expect(within(earnings).getAllByText("Replaced by settlement")).toHaveLength(2);
    expect(within(earnings).getByText("Agreed refund settlement payout")).toBeTruthy();
    expect(within(earnings).getByText(/Agreed in the refund settlement, out of your original ₱1,000\.00/)).toBeTruthy();
    expect(
      await within(earnings).findByLabelText("Open the wallet transfer evidence for Agreed refund settlement payout"),
    ).toBeTruthy();
    expect(within(earnings).getByText("Reference SHOP-200")).toBeTruthy();
    // Nothing about the client's own refund reaches the shop.
    expect(screen.queryByText(/₱710|receiving QR|client transfer/)).toBeNull();
  });
});

describe("job workspace late production", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("says nothing about lateness for a job with no record", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("Barangay tarpaulin")).toBeTruthy();
    await waitFor(() => expect(getMyProductionLapses).toHaveBeenCalled());
    expect(screen.queryByTestId("lateness-notice")).toBeNull();
  });

  it("draws this job's warning, and only this job's", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job({ readyBy: "2026-08-10T02:00:00.000Z" }));
    (getMyProductionLapses as jest.Mock).mockResolvedValueOnce({
      lapses: [
        { id: "lapse_other", orderId: "ord_9", tier: "severe", status: "warned", detectedAt: "2026-08-11T00:00:00.000Z" },
        { id: "lapse_1", orderId: "ord_1", tier: "moderate", rateBps: 1500, status: "warning_only",
          deadlineAt: "2026-08-10T02:00:00.000Z", detectedAt: "2026-08-10T10:00:00.000Z",
          warnings: [{ tier: "moderate", at: "2026-08-10T10:00:00.000Z", formal: true, message: "This order missed its ready-by deadline of 2026-08-10T02:00:00.000Z." }] },
      ],
    });
    await render(<JobWorkspaceScreen />);
    const panel = await screen.findByTestId("lateness-notice");
    expect(within(panel).getByText("Moderate lateness")).toBeTruthy();
    expect(within(panel).getByText(/^This is a warning only/)).toBeTruthy();
    expect(within(panel).queryByText(/T02:00/)).toBeNull();
    expect(screen.queryByText("Severe lateness")).toBeNull();
  });

  it("keeps the job readable when GRIDGO has no lapse route", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    (getMyProductionLapses as jest.Mock).mockRejectedValueOnce(
      new (jest.requireActual("@/lib/api").ApiError)(404, { error: "not_found" }),
    );
    await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("Barangay tarpaulin")).toBeTruthy();
    expect(screen.queryByTestId("lateness-notice")).toBeNull();
  });
});
