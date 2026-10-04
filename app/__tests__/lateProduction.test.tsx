import { render, screen } from "@testing-library/react-native";

import LateProductionScreen from "@/app/late-production";
import { getMyProductionLapses, getSettings, listJobs } from "@/lib/api";

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
}));

const POLICY = { deductionsEnabled: false, minorBps: 500, moderateBps: 1500, severeBps: 3000 };

describe("late production screen", () => {
  afterEach(() => jest.clearAllMocks());

  it("states every tier with GRIDGO's rates, and that deductions are off", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ issueWindowHours: 24, deliveryFeeBands: [], productionPenalty: POLICY });
    (getMyProductionLapses as jest.Mock).mockResolvedValue({ lapses: [] });
    await render(<LateProductionScreen />);
    expect(await screen.findByText("Minor: 5%")).toBeTruthy();
    expect(screen.getByText("Moderate: 15%")).toBeTruthy();
    expect(screen.getByText("Severe: 30%")).toBeTruthy();
    expect(screen.getByTestId("deductions-off")).toBeTruthy();
    expect(await screen.findByText("No late jobs")).toBeTruthy();
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
    expect(screen.queryByTestId("deductions-off")).toBeNull();
  });

  it("keeps the rule without numbers on an API older than the settings", async () => {
    (getSettings as jest.Mock).mockResolvedValue({ issueWindowHours: 24, deliveryFeeBands: [] });
    (getMyProductionLapses as jest.Mock).mockRejectedValue(
      new (jest.requireActual("@/lib/api").ApiError)(404, { error: "not_found" }),
    );
    await render(<LateProductionScreen />);
    expect(await screen.findByText(/not showing late-production records/)).toBeTruthy();
    expect(screen.getAllByText("Minor").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Minor: /)).toBeNull();
  });
});
