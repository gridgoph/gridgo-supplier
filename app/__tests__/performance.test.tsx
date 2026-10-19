import { render, screen } from "@testing-library/react-native";

import PerformanceScreen from "@/app/performance";
import { getMyPerformance, listJobs } from "@/lib/api";

let mockParams: { orderId?: string } = {};

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getMyPerformance: jest.fn(),
  listJobs: jest.fn(),
}));

const late = {
  id: "performance_1",
  orderId: "ord_1",
  kind: "late_finish",
  at: "2026-10-12T05:00:00.000Z",
  recordedAt: "2026-10-12T05:00:30.000Z",
  reason: "Finished after the committed ready-by and one-hour grace window.",
  reasonCode: null,
  message: "Order ord_1: finished 8 shop hours after the committed ready-by (moderate).",
  tier: "moderate",
  deadlineAt: "2026-10-11T09:00:00.000Z",
  hoursLate: 8,
  workingLateMs: 8 * 3_600_000,
  graceMinutes: 60,
  exempt: false,
  exemptionReason: null,
  warningCodes: ["late_finish"],
  active: true,
};

const cancelled = {
  ...late,
  id: "performance_2",
  orderId: "ord_2",
  kind: "cancelled",
  reason: "A machine broke down",
  reasonCode: "machine_down",
  tier: null,
  deadlineAt: null,
  hoursLate: null,
  workingLateMs: null,
  warningCodes: ["accepted_order_cancelled"],
};

function performance(overrides: Record<string, unknown> = {}) {
  return {
    performance: {
      supplierId: "supplier_id",
      asOf: "2026-10-18T04:00:00.000Z",
      policy: "warnings_only",
      windowDays: 30,
      graceMinutes: 60,
      counts: { declines: 1, timeouts: 0, lateFinishes: 2, cancellations: 1, arrivedPacked: 0 },
      rosterReview: false,
      topPick: { hidden: true, hiddenUntil: "2026-10-19T05:00:00.000Z", allHiddenFallback: true },
      onTime: { completed: 4, onTime: 2, late: 2, rate: 0.5 },
      warnings: [cancelled, late],
      notices: [late],
      events: [cancelled, late],
      ...overrides,
    },
  };
}

describe("Performance screen", () => {
  beforeEach(() => {
    mockParams = {};
    (listJobs as jest.Mock).mockResolvedValue([{ id: "ord_1", title: "Barangay tarpaulin" }]);
  });
  afterEach(() => jest.clearAllMocks());

  it("leads with no money taken, then Top Pick, on-time rate and each notice", async () => {
    (getMyPerformance as jest.Mock).mockResolvedValue(performance());
    await render(<PerformanceScreen />);
    expect(screen.getByText("Warnings only — no money is taken")).toBeTruthy();
    expect(await screen.findByText("Hidden from Top Pick")).toBeTruthy();
    expect(screen.getByText(/^Back on /)).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(await screen.findByText("Barangay tarpaulin")).toBeTruthy();
    expect(screen.getByText("Moderate lateness")).toBeTruthy();
    expect(screen.getByText(/Ready 8 hours of open shop time after its ready-by/)).toBeTruthy();
    expect(screen.getByText(/Reason: Finished after the committed ready-by/)).toBeTruthy();
    // The cancellation is a warning; the late finish is not drawn twice.
    expect(screen.getByText("Cancelled after accepting")).toBeTruthy();
    expect(screen.getByText("Your reason: A machine broke down")).toBeTruthy();
    expect(screen.getAllByTestId("notice")).toHaveLength(1);
    expect(screen.getAllByTestId("warning")).toHaveLength(1);
  });

  it("marks the notice the notification opened", async () => {
    mockParams = { orderId: "ord_1" };
    (getMyPerformance as jest.Mock).mockResolvedValue(performance());
    await render(<PerformanceScreen />);
    expect(await screen.findByTestId("notice-focused")).toBeTruthy();
    expect(screen.queryByTestId("warning-focused")).toBeNull();
  });

  it("says there is nothing late for a shop with a clean record", async () => {
    (getMyPerformance as jest.Mock).mockResolvedValue(
      performance({
        counts: { declines: 0, timeouts: 0, lateFinishes: 0, cancellations: 0, arrivedPacked: 0 },
        topPick: { hidden: false, hiddenUntil: null, allHiddenFallback: true },
        onTime: { completed: 0, onTime: 0, late: 0, rate: null },
        warnings: [],
        notices: [],
        events: [],
      }),
    );
    await render(<PerformanceScreen />);
    expect(await screen.findByText("No late finishes")).toBeTruthy();
    expect(screen.getByText("Shown for Top Pick")).toBeTruthy();
    expect(screen.getByText("No finished jobs in the last 30 days yet.")).toBeTruthy();
    expect(screen.queryByTestId("roster-review")).toBeNull();
  });

  it("says a review is not a suspension", async () => {
    (getMyPerformance as jest.Mock).mockResolvedValue(performance({ rosterReview: true }));
    await render(<PerformanceScreen />);
    expect(await screen.findByText(/This is a review, not a suspension/)).toBeTruthy();
  });

  it("is quiet on a deployment without the route", async () => {
    (getMyPerformance as jest.Mock).mockRejectedValue(
      new (jest.requireActual("@/lib/api").ApiError)(404, { error: "not_found" }),
    );
    await render(<PerformanceScreen />);
    expect(await screen.findByText(/not showing performance to shops/)).toBeTruthy();
  });
});
