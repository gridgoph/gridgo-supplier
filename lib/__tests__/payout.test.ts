import {
  isPayoutRelevant,
  matchesPayoutFilter,
  payoutRows,
  derivePayoutRow,
  sortPayoutRows,
  summarizePayouts,
  unreleasedMinor,
} from "@/lib/payout";
import { earningsSplit, milestoneViews, nextShopProof } from "@/lib/milestones";
import type { MilestoneCode, Order, PayoutMilestone } from "@/lib/api";

const SHARES: Record<MilestoneCode, number> = {
  printing: 50,
  packaging_qc: 15,
  delivered: 25,
  retention: 10,
};

function milestones(
  status: Partial<Record<MilestoneCode, PayoutMilestone["status"]>> = {},
  supplierPriceMinor = 100000,
): PayoutMilestone[] {
  return (Object.keys(SHARES) as MilestoneCode[]).map((code) => ({
    code,
    sharePercent: SHARES[code],
    amountMinor: Math.round((supplierPriceMinor * SHARES[code]) / 100),
    status: status[code] ?? "pending_pof",
    pofFileIds: (status[code] ?? "pending_pof") === "pending_pof" ? [] : ["file_1"],
    releasedAt: null,
  }));
}

function job(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    productId: "prod_tarpaulin",
    title: "Test job",
    quantity: 1,
    size: "A4",
    material: "matte",
    deadline: "2026-08-12T10:00:00+08:00",
    address: "Davao",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    subtotalMinor: 110000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
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

/**
 * The captain's worked example: a ₱1,000 shop price becomes ₱1,100 subtotal and
 * a ₱1,125 client total once GRIDGO's charge and a ₱25 delivery band are added.
 * The shop's four parts split the ₱1,000 — never the ₱1,125.
 */
describe("milestone amounts are the shop's own money", () => {
  it("splits the shop price, not the client total", () => {
    const split = earningsSplit(job({ id: "a", state: "production" }));
    expect(split.totalMinor).toBe(100000);
    expect(split.totalMinor).not.toBe(112500);
    expect(split.totalMinor).not.toBe(110000);
  });

  it("splits 50 / 15 / 25 / 10", () => {
    const views = milestoneViews(job({ id: "b", state: "production" }));
    expect(views.map((v) => [v.code, v.amountMinor])).toEqual([
      ["printing", 50000],
      ["packaging_qc", 15000],
      ["delivered", 25000],
      ["retention", 10000],
    ]);
  });
});

describe("milestone stages", () => {
  it("asks the shop for the proofs that are the shop's to give", () => {
    const views = milestoneViews(job({ id: "c", state: "production" }));
    expect(views.filter((v) => v.canAddProof).map((v) => v.code)).toEqual([
      "printing",
      "packaging_qc",
    ]);
  });

  it("never asks the shop for the rider's delivery proof", () => {
    const views = milestoneViews(job({ id: "d", state: "out_for_delivery" }));
    expect(views.find((v) => v.code === "delivered")?.canAddProof).toBe(false);
    expect(views.find((v) => v.code === "retention")?.canAddProof).toBe(false);
  });

  /**
   * A chip asking for a photo of a print run that has not started reads as a
   * job the shop is behind on, and a shop learns to ignore chips like that.
   */
  it("says a part is not started rather than asking for evidence early", () => {
    const views = milestoneViews(job({ id: "e", state: "awaiting_downpayment" }));
    expect(views.every((v) => !v.canAddProof)).toBe(true);
    const printing = views.find((v) => v.code === "printing");
    expect(printing?.stage).toBe("not_reached");
    expect(printing?.statusLabel).toBe("Not started");
    expect(printing?.statusLabel).not.toBe("Proof needed");
    // Still the shop's money, still counted as waiting on the shop.
    expect(earningsSplit(job({ id: "e2", state: "awaiting_downpayment" })).needsProofMinor).toBe(
      100000,
    );
  });

  it("moves a filed proof to GRIDGO rather than calling it done", () => {
    const view = milestoneViews(
      job({ id: "f", state: "production", payoutMilestones: milestones({ printing: "pof_attached" }) }),
    ).find((v) => v.code === "printing");
    expect(view?.stage).toBe("awaiting_release");
    expect(view?.statusLabel).toBe("With GRIDGO");
    expect(view?.canAddProof).toBe(false);
  });

  it("says a claim is holding the money, and stops asking for evidence", () => {
    const views = milestoneViews(job({ id: "g", state: "production", payoutHold: true }));
    expect(views.every((v) => v.stage === "held")).toBe(true);
    expect(views.every((v) => !v.canAddProof)).toBe(true);
  });

  it("leaves released money released even under a claim", () => {
    const views = milestoneViews(
      job({
        id: "h",
        state: "issue_window_open",
        payoutHold: true,
        payoutMilestones: milestones({ printing: "released" }),
      }),
    );
    expect(views.find((v) => v.code === "printing")?.stage).toBe("released");
    expect(views.find((v) => v.code === "retention")?.stage).toBe("held");
  });

  it("never puts a state string or a code on screen", () => {
    for (const state of ["production", "issue_window_open", "completed"]) {
      for (const view of milestoneViews(job({ id: state, state }))) {
        expect(view.label).not.toMatch(/_/);
        expect(view.statusLabel).not.toMatch(/_/);
        expect(view.detail).not.toMatch(/_/);
      }
    }
  });
});

describe("nextShopProof", () => {
  it("returns the earliest part the shop still owes", () => {
    expect(nextShopProof(job({ id: "i", state: "production" }))?.code).toBe("printing");
    expect(
      nextShopProof(
        job({ id: "j", state: "production", payoutMilestones: milestones({ printing: "released" }) }),
      )?.code,
    ).toBe("packaging_qc");
  });

  it("returns nothing when the shop owes none", () => {
    expect(
      nextShopProof(
        job({
          id: "k",
          state: "production",
          payoutMilestones: milestones({ printing: "released", packaging_qc: "pof_attached" }),
        }),
      ),
    ).toBeNull();
  });
});

describe("earningsSplit", () => {
  it("puts every part in exactly one bucket", () => {
    const split = earningsSplit(
      job({
        id: "l",
        state: "issue_window_open",
        payoutMilestones: milestones({ printing: "released", packaging_qc: "pof_attached" }),
      }),
    );
    expect(split.releasedMinor).toBe(50000);
    expect(split.awaitingReleaseMinor).toBe(15000);
    // Delivered and retention are the rider's evidence, still to come.
    expect(split.needsProofMinor).toBe(35000);
    expect(
      split.releasedMinor + split.awaitingReleaseMinor + split.needsProofMinor + split.heldMinor,
    ).toBe(split.totalMinor);
  });

  it("leaves nothing owed once every part has released", () => {
    const split = earningsSplit(
      job({
        id: "m",
        state: "payout_released",
        payoutMilestones: milestones({
          printing: "released",
          packaging_qc: "released",
          delivered: "released",
          retention: "released",
        }),
      }),
    );
    expect(unreleasedMinor(split)).toBe(0);
    expect(split.releasedMinor).toBe(100000);
  });
});

describe("payout rows", () => {
  it("only lists jobs that have money attached to them", () => {
    expect(isPayoutRelevant(job({ id: "n", state: "production" }))).toBe(true);
    expect(
      isPayoutRelevant(job({ id: "o", state: "supplier_assigned", payoutMilestones: [] })),
    ).toBe(false);
    expect(payoutRows([job({ id: "p", state: "supplier_assigned", payoutMilestones: [] })])).toEqual(
      [],
    );
  });

  it("filters on whether anything is still owed, not on job state", () => {
    const owed = derivePayoutRow(job({ id: "q", state: "production" }));
    const done = derivePayoutRow(
      job({
        id: "r",
        state: "payout_released",
        payoutMilestones: milestones({
          printing: "released",
          packaging_qc: "released",
          delivered: "released",
          retention: "released",
        }),
      }),
    );
    expect(matchesPayoutFilter(owed, "unsettled")).toBe(true);
    expect(matchesPayoutFilter(owed, "released")).toBe(false);
    expect(matchesPayoutFilter(done, "released")).toBe(true);
    expect(matchesPayoutFilter(done, "unsettled")).toBe(false);
    expect(matchesPayoutFilter(owed, "all")).toBe(true);
    expect(matchesPayoutFilter(done, "all")).toBe(true);
  });

  it("puts what the shop can act on at the top", () => {
    const rows = sortPayoutRows(
      payoutRows([
        job({
          id: "settled",
          title: "Settled",
          state: "payout_released",
          payoutMilestones: milestones({
            printing: "released",
            packaging_qc: "released",
            delivered: "released",
            retention: "released",
          }),
        }),
        job({ id: "held", title: "Held", state: "issue_window_open", payoutHold: true }),
        job({ id: "owed", title: "Owed", state: "production" }),
      ]),
    );
    expect(rows.map((r) => r.orderId)).toEqual(["owed", "held", "settled"]);
  });
});

describe("summarizePayouts", () => {
  it("adds the shop's own money across every job", () => {
    const total = summarizePayouts([
      job({ id: "s", state: "production" }),
      job({
        id: "t",
        state: "issue_window_open",
        payoutMilestones: milestones({ printing: "released" }, 60000),
        supplierPriceMinor: 60000,
      }),
    ]);
    expect(total.jobCount).toBe(2);
    expect(total.totalMinor).toBe(160000);
    expect(total.releasedMinor).toBe(30000);
    expect(unreleasedMinor(total)).toBe(130000);
  });

  it("reports nothing for a shop with no priced jobs", () => {
    const total = summarizePayouts([]);
    expect(total.jobCount).toBe(0);
    expect(unreleasedMinor(total)).toBe(0);
  });
});
