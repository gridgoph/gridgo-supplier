import type { Order, PayoutMilestone } from "@/lib/api";
import { owedProductionMove } from "@/lib/productionNudge";

type Job = Pick<Order, "state" | "payoutMilestones" | "payoutHold" | "payoutPlanVersion">;

const escrow = (start: PayoutMilestone["status"] = "pending_pof"): PayoutMilestone[] => [
  { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 400, status: start, pofFileIds: [], releasedAt: null },
  { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35, amountMinor: 350, status: "pending_pof", pofFileIds: [], releasedAt: null },
  { code: "issue_window", label: "Issue window closed", releaseRequires: "issue_window_closed", sharePercent: 25, amountMinor: 250, status: "pending_pof", pofFileIds: [], releasedAt: null },
];

const legacy = (printing: PayoutMilestone["status"] = "pending_pof"): PayoutMilestone[] => [
  { code: "printing", sharePercent: 50, amountMinor: 500, status: printing, pofFileIds: [], releasedAt: null },
  { code: "packaging_qc", sharePercent: 15, amountMinor: 150, status: "pending_pof", pofFileIds: [], releasedAt: null },
  { code: "delivered", sharePercent: 25, amountMinor: 250, status: "pending_pof", pofFileIds: [], releasedAt: null },
  { code: "retention", sharePercent: 10, amountMinor: 100, status: "pending_pof", pofFileIds: [], releasedAt: null },
];

const job = (partial: Partial<Job>): Job => ({ state: "production", payoutHold: false, ...partial });

describe("owedProductionMove", () => {
  it("names the start-of-production proof on a plan-2 job", () => {
    expect(owedProductionMove(job({ payoutPlanVersion: 2, payoutMilestones: escrow() }))).toBe(
      "Update the press or file start-of-production proof",
    );
  });

  it("names no printing or packaging proof once a plan-2 start is filed", () => {
    const filed = { payoutPlanVersion: 2 as const, payoutMilestones: escrow("pof_attached") };
    expect(owedProductionMove(job(filed))).toBe("Update the press or pack it for pickup");
    expect(owedProductionMove(job({ ...filed, state: "supplier_self_qc" }))).toBe("Pack it for pickup");
    expect(owedProductionMove(job({ ...filed, state: "payment_authorized" }))).toBe("Start production");
  });

  it("keeps the legacy printing and packaging proofs on a plan-1 job", () => {
    expect(owedProductionMove(job({ payoutMilestones: legacy() }))).toBe("Update the press or file printing proof");
    expect(owedProductionMove(job({ payoutMilestones: legacy("pof_attached") }))).toBe("Pack it or file packaging proof");
  });

  it("names no proof when the job itself is not loaded", () => {
    expect(owedProductionMove(null, "production")).toBe("Update the press or pack it for pickup");
    expect(owedProductionMove(null, "supplier_self_qc")).toBe("Pack it for pickup");
    expect(owedProductionMove(undefined, "payment_authorized")).toBe("Start production");
  });
});
