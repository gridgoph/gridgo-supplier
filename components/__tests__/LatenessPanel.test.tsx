import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { router } from "expo-router";

import { LatenessPanel } from "@/components/LatenessPanel";
import { lapseNotice, type ProductionLapse } from "@/lib/productionLapse";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const DEADLINE = "2026-10-01T02:00:00.000Z";

function lapse(partial: Partial<ProductionLapse> = {}): ProductionLapse {
  return {
    id: "lapse_1",
    orderId: "ord_1",
    deadlineAt: DEADLINE,
    detectedAt: DEADLINE,
    tier: "minor",
    rateBps: 500,
    warnings: [],
    remainingBalanceMinor: 0,
    deductionMinor: 0,
    appliedAt: null,
    closedAt: null,
    reassignmentEligible: false,
    status: "warning_only",
    ...partial,
  };
}

const now = new Date(Date.parse(DEADLINE) + 3 * 3_600_000);

describe("LatenessPanel", () => {
  it("draws a warning-only minor lapse with its tier lit on the scale", async () => {
    await render(<LatenessPanel notice={lapseNotice(lapse(), { readyBy: DEADLINE, readyAt: null }, now)} />);
    expect(screen.getByText("Minor lateness")).toBeTruthy();
    expect(screen.getByText("This job is past its ready-by time")).toBeTruthy();
    expect(screen.getByText(/^This is a warning only/)).toBeTruthy();
    expect(screen.getByTestId("lateness-scale").props.accessibilityLabel).toMatch(/^This job: Minor lateness\./);
    expect(screen.queryByTestId("deduction-ledger")).toBeNull();
  });

  it("sets an applied deduction against what was still owed", async () => {
    const notice = lapseNotice(
      lapse({ tier: "moderate", rateBps: 1500, status: "applied", remainingBalanceMinor: 60_000, deductionMinor: 9_000 }),
      { readyBy: DEADLINE, readyAt: now.toISOString() },
    );
    await render(<LatenessPanel notice={notice} />);
    const ledger = within(screen.getByTestId("deduction-ledger"));
    expect(ledger.getByText("Still owed on this job")).toBeTruthy();
    expect(ledger.getByText("₱600.00")).toBeTruthy();
    expect(ledger.getByText("Late production (15%)")).toBeTruthy();
    expect(ledger.getByText("−₱90.00")).toBeTruthy();
    expect(ledger.getByText("₱510.00")).toBeTruthy();
    expect(screen.getByText("A formal warning is on your shop's record.")).toBeTruthy();
  });

  it("caps a deduction that exceeds the balance at the balance", async () => {
    const notice = lapseNotice(
      lapse({ status: "applied", remainingBalanceMinor: 5_000, deductionMinor: 8_000 }),
      { readyBy: DEADLINE, readyAt: now.toISOString() },
    );
    await render(<LatenessPanel notice={notice} />);
    const ledger = within(screen.getByTestId("deduction-ledger"));
    expect(ledger.getByText("−₱50.00")).toBeTruthy();
    expect(ledger.getByText("₱0.00")).toBeTruthy();
    expect(ledger.queryByText("−₱80.00")).toBeNull();
  });

  it("opens the policy from its link", async () => {
    await render(<LatenessPanel notice={lapseNotice(lapse(), { readyBy: DEADLINE }, now)} />);
    await fireEvent.press(screen.getByText("How late production is handled"));
    expect(router.push).toHaveBeenCalledWith("/late-production");
  });
});
