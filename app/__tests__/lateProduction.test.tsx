import { render, screen } from "@testing-library/react-native";

import LateProductionScreen from "@/app/late-production";
import { NO_MONEY_TAKEN } from "@/lib/performance";
import { TIGHT_LATE_LINE } from "@/lib/scheduling";
import { getMyProductionLapses, getMyRescheduleRequests, getMyShopFailures, getSettings, listJobs } from "@/lib/api";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getMyProductionLapses: jest.fn(),
  getSettings: jest.fn(),
  listJobs: jest.fn(async () => [{ id: "ord_1", title: "Barangay tarpaulin" }]),
  getMyShopFailures: jest.fn(async () => ({ events: [] })),
  getMyRescheduleRequests: jest.fn(async () => ({ totalRequests: 0, requests: [] })),
}));

const POLICY = { deductionsEnabled: false, minorBps: 500, moderateBps: 1500, severeBps: 3000 };

describe("late production screen", () => {
  afterEach(() => jest.clearAllMocks());

  /** Warnings only (gridgo-api SUPPLIER_PERFORMANCE_API.md): true even when the legacy flag is on. */
  it("states every tier as a warning and that no money is taken, whatever the legacy flag", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ issueWindowHours: 24, deliveryFeeBands: [], productionPenalty: { ...POLICY, deductionsEnabled: true } });
    (getMyProductionLapses as jest.Mock).mockResolvedValue({ lapses: [] });
    await render(<LateProductionScreen />);
    expect(await screen.findByText("No late jobs")).toBeTruthy();
    expect(screen.getByTestId("no-money-taken")).toBeTruthy();
    expect(screen.getByText(NO_MONEY_TAKEN)).toBeTruthy();
    expect(screen.getByText(TIGHT_LATE_LINE)).toBeTruthy();
    expect(screen.getAllByText("Moderate").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Minor: /)).toBeNull();
    expect(screen.queryByText("WHAT A DEDUCTION TAKES")).toBeNull();
    expect(screen.queryByText(/share/)).toBeNull();
    expect(screen.queryByText(/another shop/)).toBeNull();
    expect(screen.queryByText(/comes off your payout\./)).toBeNull();
  });

  it("lists the shop's late jobs with each deduction against what was owed", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ issueWindowHours: 24, deliveryFeeBands: [], productionPenalty: { ...POLICY, deductionsEnabled: true } });
    (getMyProductionLapses as jest.Mock).mockResolvedValue({
      lapses: [{
        id: "lapse_1", orderId: "ord_1", tier: "moderate", rateBps: 1500, status: "applied",
        deadlineAt: "2026-10-01T02:00:00.000Z", detectedAt: "2026-10-01T10:00:00.000Z",
        remainingBalanceMinor: 60000, deductionMinor: 9000, appliedAt: "2026-10-01T12:00:00.000Z",
        warnings: [{ tier: "moderate", at: "2026-10-01T10:00:00.000Z", formal: true }],
      }],
    });
    await render(<LateProductionScreen />);
    expect(await screen.findByText("₱90.00 off ₱600.00 still owed")).toBeTruthy();
    expect(await screen.findByText("Barangay tarpaulin")).toBeTruthy();
    expect(screen.getByText("Formal warning on your record")).toBeTruthy();
    // A deduction applied before warnings only stays on the record as history.
    expect(screen.getByTestId("no-money-taken")).toBeTruthy();
  });

  it("keeps the rule on an API without late-production records", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ issueWindowHours: 24, deliveryFeeBands: [] });
    (getMyProductionLapses as jest.Mock).mockRejectedValue(
      new (jest.requireActual("@/lib/api").ApiError)(404, { error: "not_found" }),
    );
    await render(<LateProductionScreen />);
    expect(await screen.findByText(/not showing late-production records/)).toBeTruthy();
    expect(screen.getAllByText("Minor").length).toBeGreaterThan(0);
    expect(screen.getByTestId("no-money-taken")).toBeTruthy();
  });
});

describe("the rest of the shop's record", () => {
  const ApiError = jest.requireActual("@/lib/api").ApiError;
  beforeEach(() => {
    (getSettings as jest.Mock).mockResolvedValue({ issueWindowHours: 24, deliveryFeeBands: [], productionPenalty: POLICY });
    (getMyProductionLapses as jest.Mock).mockResolvedValue({ lapses: [] });
    (getMyShopFailures as jest.Mock).mockResolvedValue({ events: [] });
    (getMyRescheduleRequests as jest.Mock).mockResolvedValue({ totalRequests: 0, requests: [] });
  });
  afterEach(() => jest.clearAllMocks());

  it("lists jobs let go with the stage they reached, beside the late jobs", async () => {
    (getMyShopFailures as jest.Mock).mockResolvedValue({
      events: [
        { id: "e1", orderId: "ord_1", kind: "cancelled", stage: "production", reason: "Out of vinyl", at: "2026-10-03T00:00:00Z" },
        { id: "e2", orderId: "ord_9", kind: "timed_out", stage: "supplier_assigned", reason: "No response within one opening hour.", at: "2026-10-02T00:00:00Z" },
      ],
    });
    await render(<LateProductionScreen />);
    expect(await screen.findByText("JOBS YOU LET GO")).toBeTruthy();
    expect(await screen.findByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("Out of vinyl")).toBeTruthy();
    expect(screen.getByText(/^During production, /)).toBeTruthy();
    expect(screen.getByText("Not answered in time")).toBeTruthy();
    expect(screen.queryByText(/No response within one opening hour/)).toBeNull();
  });

  it("lists every deadline request with where it stands", async () => {
    (getMyRescheduleRequests as jest.Mock).mockResolvedValue({
      totalRequests: 1,
      requests: [{
        id: "resched_1", orderId: "ord_1", reason: "Laminator", status: "expired",
        requestedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-02T00:00:00Z", answeredAt: null,
        resolution: null, workHeld: false,
        originalReadyBy: "2026-10-04T00:00:00Z", proposedReadyBy: "2026-10-06T00:00:00Z",
      }],
    });
    await render(<LateProductionScreen />);
    expect(await screen.findByText("DEADLINE REQUESTS")).toBeTruthy();
    expect(await screen.findByText("Not answered")).toBeTruthy();
  });

  it("says when the record has nothing in it", async () => {
    await render(<LateProductionScreen />);
    expect(await screen.findByText("Every job offered to your shop was answered and kept.")).toBeTruthy();
    expect(screen.getByText("You have not asked a client to move a deadline.")).toBeTruthy();
  });

  it("states a deployment without deadline requests quietly", async () => {
    (getMyRescheduleRequests as jest.Mock).mockRejectedValue(new ApiError(404, { error: "not_found" }));
    await render(<LateProductionScreen />);
    expect(await screen.findByText(/not taking deadline requests on this connection yet/)).toBeTruthy();
  });
});
