import {
  isPayoutRelevant,
  matchesPayoutFilter,
  payoutRows,
  derivePayoutRow,
  sortPayoutRows,
  statementLines,
  statementMonths,
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
    // Still the shop's money, but nothing it can act on — so it is counted as
    // later in the job, not as evidence the shop is sitting on.
    const early = earningsSplit(job({ id: "e2", state: "awaiting_downpayment" }));
    expect(early.needsProofMinor).toBe(0);
    expect(early.laterMinor).toBe(100000);
  });

  it("moves a filed proof to GRIDGO rather than calling it done", () => {
    const view = milestoneViews(
      job({ id: "f", state: "production", payoutMilestones: milestones({ printing: "pof_attached" }) }),
    ).find((v) => v.code === "printing");
    expect(view?.stage).toBe("awaiting_release");
    expect(view?.statusLabel).toBe("With GRIDGO");
    expect(view?.canAddProof).toBe(false);
    expect(view?.pofFileIds).toEqual(["file_1"]);
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
    // Delivered and retention are the rider's evidence, not the shop's.
    expect(split.needsProofMinor).toBe(0);
    expect(split.laterMinor).toBe(35000);
    expect(
      split.releasedMinor +
        split.awaitingReleaseMinor +
        split.needsProofMinor +
        split.laterMinor +
        split.heldMinor,
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

describe("the statement", () => {
  const job = (id: string, title: string, milestones: PayoutMilestone[]): Order =>
    ({ id, title, payoutMilestones: milestones } as unknown as Order);
  const part = (
    code: PayoutMilestone["code"],
    amountMinor: number,
    releasedAt: string | null,
  ): PayoutMilestone =>
    ({
      code,
      sharePercent: 50,
      amountMinor,
      status: releasedAt ? "released" : "pending_pof",
      pofFileIds: [],
      releasedAt,
    }) as PayoutMilestone;

  it("is a line per release, newest first, and never an unreleased part", () => {
    // A job row answers "how is this job going". Only a dated line answers
    // "what did GRIDGO send me", which is the question a bank statement asks.
    const lines = statementLines([
      job("ord_a", "Staff polos", [
        part("printing", 55_000, "2026-08-02T03:00:00.000Z"),
        part("packaging_qc", 16_500, null),
      ]),
      job("ord_b", "Seminar handouts", [
        part("printing", 30_000, "2026-08-20T03:00:00.000Z"),
      ]),
    ]);
    expect(lines.map((line) => line.orderId)).toEqual(["ord_b", "ord_a"]);
    expect(lines).toHaveLength(2);
    expect(lines[0].label).toBe("Printing");
  });

  it("carries the wallet receipt and reference Operations kept, and nothing when they did not", () => {
    const lines = statementLines([
      job("ord_a", "Staff polos", [
        {
          ...part("printing", 55_000, "2026-08-02T03:00:00.000Z"),
          receiptFileId: "file_receipt",
          reference: "GCASH-777",
        },
        part("packaging_qc", 16_500, "2026-08-03T03:00:00.000Z"),
      ]),
    ]);
    expect(lines[1]).toMatchObject({ code: "printing", receiptFileId: "file_receipt", reference: "GCASH-777" });
    expect(lines[0]).toMatchObject({ code: "packaging_qc", receiptFileId: null, reference: null });
  });

  it("names a plan-2 release by GRIDGO's own label", () => {
    const lines = statementLines([
      job("ord_c", "Menu boards", [
        { ...part("production_started", 40_000, "2026-09-26T02:00:00.000Z"), label: "Start of production", releaseRequires: "shop_proof" },
        { ...part("issue_window", 25_000, "2026-10-06T02:00:00.000Z"), label: "Issue window closed", releaseRequires: "issue_window_closed" },
        part("some_future_stage", 1_000, "2026-10-07T02:00:00.000Z"),
      ]),
    ]);
    expect(lines.map((line) => line.label)).toEqual(["Some future stage", "Issue window closed", "Start of production"]);
  });

  it("groups by the Davao month, not the phone's own", () => {
    // A release at 09:00 on 1 September in Manila is 01:00 UTC that day, but a
    // release at 07:00 on 1 September Manila is 23:00 on 31 August UTC — and it
    // belongs in September, because that is the month the shop banked it in.
    const lines = statementLines([
      job("ord_a", "Booth backdrops", [
        part("printing", 10_000, "2026-08-31T23:00:00.000Z"),
        part("delivered", 5_000, "2026-08-31T15:00:00.000Z"),
      ]),
    ]);
    const months = statementMonths(lines);
    expect(months.map((month) => month.key)).toEqual(["2026-09", "2026-08"]);
    expect(months[0].totalMinor).toBe(10_000);
    expect(months[1].totalMinor).toBe(5_000);
    expect(months[0].label).toMatch(/September 2026/);
  });

  it("counts the releases behind each month's figure", () => {
    const lines = statementLines([
      job("ord_a", "Exam papers", [
        part("printing", 10_000, "2026-08-05T03:00:00.000Z"),
        part("packaging_qc", 3_000, "2026-08-06T03:00:00.000Z"),
      ]),
    ]);
    const [august] = statementMonths(lines);
    expect(august.releaseCount).toBe(2);
    expect(august.totalMinor).toBe(13_000);
  });

  it("keeps an unparseable release date out of the months rather than guessing", () => {
    const lines = statementLines([
      job("ord_a", "Window decals", [part("printing", 10_000, "not a date")]),
    ]);
    expect(lines).toHaveLength(1);
    expect(statementMonths(lines)).toEqual([]);
  });
});
