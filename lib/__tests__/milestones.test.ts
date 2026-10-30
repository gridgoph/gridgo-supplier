import type { Order, PayoutMilestone } from "@/lib/api";
import {
  earningsSplit,
  isShopProof,
  MAX_PROOFS_PER_STAGE,
  milestoneDefinition,
  milestoneViews,
  nextShopProof,
  payoutPlanCopy,
  payoutPlanOf,
  proofTarget,
} from "@/lib/milestones";

type Status = PayoutMilestone["status"];

/** Plan 2 as gridgo-api serves it: labels and release rules on every stage. */
function escrow(status: Partial<Record<string, Status>> = {}): PayoutMilestone[] {
  const stages = [
    { code: "production_started", label: "Start of production", sharePercent: 40, releaseRequires: "shop_proof" },
    { code: "delivered", label: "Delivered", sharePercent: 35, releaseRequires: "delivery_proof" },
    { code: "issue_window", label: "Issue window closed", sharePercent: 25, releaseRequires: "issue_window_closed" },
  ] as const;
  return stages.map((stage) => ({
    ...stage,
    amountMinor: stage.sharePercent * 1000,
    status: status[stage.code] ?? "pending_pof",
    pofFileIds: (status[stage.code] ?? "pending_pof") === "pending_pof" ? [] : ["file_1"],
    releasedAt: status[stage.code] === "released" ? "2026-09-26T02:00:00.000Z" : null,
  }));
}

/** Plan 1 as an API older than the escrow plan serves it: codes only. */
function legacy(status: Partial<Record<string, Status>> = {}): PayoutMilestone[] {
  const shares = { printing: 50, packaging_qc: 15, delivered: 25, retention: 10 } as const;
  return Object.entries(shares).map(([code, sharePercent]) => ({
    code,
    sharePercent,
    amountMinor: sharePercent * 1000,
    status: status[code] ?? "pending_pof",
    pofFileIds: (status[code] ?? "pending_pof") === "pending_pof" ? [] : ["file_1"],
    releasedAt: null,
  }));
}

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    productId: "prod_flyers",
    title: "Flyers",
    quantity: 500,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Davao",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    payoutPlanVersion: 2,
    payoutMilestones: escrow(),
    payoutHold: false,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-09-25T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("payoutPlanOf", () => {
  it("reads the order's own plan version", () => {
    expect(payoutPlanOf(order())).toBe(2);
    expect(payoutPlanOf(order({ payoutPlanVersion: 1, payoutMilestones: legacy() }))).toBe(1);
  });

  it("treats the four legacy codes from an older API as plan 1", () => {
    expect(payoutPlanOf(order({ payoutPlanVersion: undefined, payoutMilestones: legacy() }))).toBe(1);
  });

  it("expects the current plan for a job with no stages yet", () => {
    expect(payoutPlanOf(order({ payoutPlanVersion: null, payoutMilestones: [] }))).toBe(2);
  });
});

describe("milestoneDefinition", () => {
  it("never labels a code it does not know as another stage", () => {
    const unknown = milestoneDefinition("final_audit");
    expect(unknown.label).toBe("Final audit");
    expect(unknown.label).not.toBe("Printing");
    expect(unknown.proofOwner).not.toBe("shop");
  });

  it("takes GRIDGO's label and release rule over its own table", () => {
    const named = milestoneDefinition("final_audit", { label: "Final audit passed", releaseRequires: "shop_proof" });
    expect(named.label).toBe("Final audit passed");
    expect(named.proofOwner).toBe("shop");
    expect(named.proofName).toBe("final audit passed");
    expect(isShopProof({ code: "final_audit", releaseRequires: "shop_proof" })).toBe(true);
  });

  it("names the start-of-production proof", () => {
    const start = milestoneDefinition("production_started", { label: "Start of production", releaseRequires: "shop_proof" });
    expect(start.label).toBe("Start of production");
    expect(start.proofLabel).toBe("Photo that production has started");
    expect(start.proofName).toBe("start-of-production");
  });

  it("keeps the legacy wording for plan-1 codes", () => {
    expect(milestoneDefinition("printing").label).toBe("Printing");
    expect(milestoneDefinition("packaging_qc").label).toBe("Packaging");
    expect(milestoneDefinition("retention").proofOwner).toBe("inherited");
    expect(milestoneDefinition("retention", { releaseRequires: "issue_window_closed" }).proofOwner).toBe("inherited");
  });
});

describe("plan 2 milestone views", () => {
  it("renders the three parts in GRIDGO's order with GRIDGO's labels", () => {
    const views = milestoneViews(order());
    expect(views.map((v) => [v.code, v.label, v.sharePercent])).toEqual([
      ["production_started", "Start of production", 40],
      ["delivered", "Delivered", 35],
      ["issue_window", "Issue window closed", 25],
    ]);
  });

  it("does not ask for a start-of-production photo before production starts", () => {
    const [start] = milestoneViews(order({ state: "payment_authorized" }));
    expect(start.stage).toBe("not_reached");
    expect(start.canAddProof).toBe(false);
    expect(nextShopProof(order({ state: "payment_authorized" }))).toBeNull();
  });

  it("asks the shop for its start-of-production proof once production is under way", () => {
    const owed = nextShopProof(order());
    expect(owed?.code).toBe("production_started");
    expect(owed?.statusLabel).toBe("Proof needed");
    expect(owed?.proofName).toBe("start-of-production");
    expect(earningsSplit(order()).needsProofMinor).toBe(40000);
  });

  it("owes nothing more once the start-of-production proof is filed", () => {
    const filed = order({ state: "ready_for_dispatch", payoutMilestones: escrow({ production_started: "pof_attached" }) });
    expect(nextShopProof(filed)).toBeNull();
    const [start, delivered, window] = milestoneViews(filed);
    expect(start.stage).toBe("awaiting_release");
    expect(delivered.stage).toBe("waiting_on_delivery");
    expect(delivered.canAddProof).toBe(false);
    expect(window.stage).toBe("waiting_on_window");
    expect(window.statusLabel).toBe("After window closes");
  });

  it("times the delivered part and the window part apart before delivery", () => {
    const [, delivered, window] = milestoneViews(order({ state: "production" }));
    expect(delivered.statusLabel).toBe("After delivery");
    expect(window.statusLabel).toBe("After window closes");
    expect(delivered.statusLabel).not.toBe(window.statusLabel);
    // Amounts and the API's order stand as they were.
    expect([delivered.amountMinor, window.amountMinor]).toEqual([35000, 25000]);
    expect(milestoneViews(order()).map((view) => view.code)).toEqual(["production_started", "delivered", "issue_window"]);
  });

  it("keeps the window part With GRIDGO after the window, never Released until it is", () => {
    const closed = order({ state: "completed", payoutMilestones: escrow({ production_started: "released", delivered: "released" }) });
    expect(milestoneViews(closed)[2].statusLabel).toBe("With GRIDGO");
    const paid = order({
      state: "payout_released",
      payoutMilestones: escrow({ production_started: "released", delivered: "released", issue_window: "released" }),
    });
    expect(milestoneViews(paid)[2].statusLabel).toBe("Released");
  });

  it("says the rider's automatic delivery proof is filed, not the shop's", () => {
    const delivered = order({
      state: "issue_window_open",
      payoutMilestones: escrow({ production_started: "released", delivered: "pof_attached" }),
    });
    const view = milestoneViews(delivered)[1];
    expect(view.stage).toBe("awaiting_release");
    expect(view.detail).toMatch(/^The rider's delivery evidence is filed/);
  });

  it("waits on the complaint window, then on Operations, for the last part", () => {
    const open = order({ state: "issue_window_open", payoutMilestones: escrow({ production_started: "released", delivered: "released" }) });
    const waiting = milestoneViews(open)[2];
    expect(waiting.stage).toBe("waiting_on_window");
    expect(waiting.statusLabel).toBe("Window open");
    expect(waiting.canAddProof).toBe(false);
    expect(earningsSplit(open).laterMinor).toBe(25000);

    const closed = order({ ...open, state: "completed" });
    const releasable = milestoneViews(closed)[2];
    expect(releasable.stage).toBe("awaiting_release");
    expect(releasable.statusLabel).toBe("With GRIDGO");
    expect(earningsSplit(closed).awaitingReleaseMinor).toBe(25000);
  });

  it("holds every unreleased part while a claim is open", () => {
    const held = order({ state: "issue_window_open", payoutHold: true, payoutMilestones: escrow({ production_started: "released" }) });
    expect(milestoneViews(held).map((v) => v.stage)).toEqual(["released", "held", "held"]);
  });

  it("never mentions retention or a printing proof", () => {
    const words = ["payment_authorized", "production", "delivered", "issue_window_open", "completed"]
      .flatMap((state) => milestoneViews(order({ state })))
      .map((v) => `${v.label} ${v.statusLabel} ${v.detail}`)
      .join(" ");
    expect(words).not.toMatch(/retention|printing|packaging/i);
  });

  it("renders a stage a future plan adds without calling it Printing", () => {
    const future = order({
      payoutMilestones: [
        ...escrow(),
        { code: "warranty", label: "", sharePercent: 0, amountMinor: 0, status: "pending_pof", pofFileIds: [], releasedAt: null },
      ],
    });
    const extra = milestoneViews(future)[3];
    expect(extra.label).toBe("Warranty");
    expect(extra.canAddProof).toBe(false);
  });
});

describe("plan 1 milestone views", () => {
  it("still asks for printing, then packaging, and inherits retention", () => {
    const job = order({ payoutPlanVersion: 1, payoutMilestones: legacy() });
    expect(milestoneViews(job).map((v) => v.label)).toEqual(["Printing", "Packaging", "Delivered", "Retention"]);
    expect(nextShopProof(job)?.code).toBe("printing");

    const printed = order({ payoutPlanVersion: 1, payoutMilestones: legacy({ printing: "pof_attached" }) });
    expect(nextShopProof(printed)?.code).toBe("packaging_qc");
    expect(milestoneViews(printed)[3].detail).toMatch(/^Retention rides on the same delivery evidence/);
  });

  it("times retention by the window, apart from the delivered part, with amounts unchanged", () => {
    const [, , delivered, retention] = milestoneViews(order({ payoutPlanVersion: 1, payoutMilestones: legacy() }));
    expect(delivered.statusLabel).toBe("After delivery");
    expect(retention.statusLabel).toBe("After window closes");
    expect([delivered.amountMinor, retention.amountMinor]).toEqual([25000, 10000]);
    expect(retention.stage).toBe("waiting_on_delivery");
  });
});

describe("payoutPlanCopy", () => {
  it("describes the escrow split without four parts or retention", () => {
    const copy = payoutPlanCopy({ payoutPlanVersion: 2, payoutMilestones: [] });
    expect(copy.parts).toBe("three");
    expect(copy.howItReachesYou).toMatch(/40%.*35%.*25%/);
    expect(copy.howItReachesYou).not.toMatch(/retention|four/i);
  });

  it("keeps the legacy four parts for a plan-1 job", () => {
    const copy = payoutPlanCopy({ payoutPlanVersion: 1 });
    expect(copy.parts).toBe("four");
    expect(copy.howItReachesYou).toMatch(/retention part/);
  });
});

describe("late-production deductions", () => {
  /** GRIDGO takes from the last unpaid stages first; amounts arrive net. */
  function deducted(): PayoutMilestone[] {
    return escrow({ production_started: "released" }).map((stage) =>
      stage.code === "issue_window"
        ? { ...stage, amountMinor: 25000 - 9000, productionDeductionMinor: 9000 }
        : stage,
    );
  }

  it("names what came off each part, beside its net amount", () => {
    const views = milestoneViews(order({ payoutMilestones: deducted() }));
    expect(views.map((v) => [v.code, v.amountMinor, v.lateDeductionMinor])).toEqual([
      ["production_started", 40000, 0],
      ["delivered", 35000, 0],
      ["issue_window", 16000, 9000],
    ]);
  });

  it("totals the deduction beside the split without subtracting it twice", () => {
    const split = earningsSplit(order({ payoutMilestones: deducted() }));
    expect(split.lateDeductionMinor).toBe(9000);
    expect(split.totalMinor).toBe(40000 + 35000 + 16000);
    expect(split.releasedMinor).toBe(40000);
  });

  it("reads a stage without the field as nothing taken", () => {
    expect(earningsSplit(order()).lateDeductionMinor).toBe(0);
    expect(milestoneViews(order())[0].lateDeductionMinor).toBe(0);
  });
});

describe("adding more proof photos", () => {
  function withStart(patch: Partial<PayoutMilestone>, extra: Partial<Order> = {}): Order {
    const stages = escrow({ production_started: patch.status ?? "pof_attached" });
    stages[0] = { ...stages[0], ...patch };
    return order({ payoutMilestones: stages, ...extra });
  }

  it("draws a picture GRIDGO listed twice only once", () => {
    const start = milestoneViews(withStart({ pofFileIds: ["file_a", "file_b", "file_a"] }))[0];
    expect(start.pofFileIds).toEqual(["file_a", "file_b"]);
    expect(start.proofCount).toBe(2);
  });

  it("takes more photos on a part that already has its proof, and after release", () => {
    const filed = milestoneViews(withStart({ status: "pof_attached" }))[0];
    expect(filed.canAddProof).toBe(false);
    expect(filed.canFileMore).toBe(true);
    const released = milestoneViews(withStart({ status: "released" }))[0];
    expect(released.stage).toBe("released");
    expect(released.canFileMore).toBe(true);
  });

  it("stops at the 50-photo limit but still names the part as the shop's", () => {
    const ids = Array.from({ length: MAX_PROOFS_PER_STAGE }, (_, i) => `file_${i}`);
    const full = milestoneViews(withStart({ pofFileIds: ids }))[0];
    expect(MAX_PROOFS_PER_STAGE).toBe(50);
    expect(full.canFileMore).toBe(false);
    expect(full.takesProof).toBe(true);
    expect(proofTarget(withStart({ pofFileIds: ids }), "production_started")?.code).toBe("production_started");
  });

  it("never takes the shop's photos on the rider's part or the window", () => {
    const views = milestoneViews(withStart({}, { state: "delivered" }));
    expect(views.find((v) => v.code === "delivered")?.canFileMore).toBe(false);
    expect(views.find((v) => v.code === "issue_window")?.canFileMore).toBe(false);
    expect(proofTarget(withStart({}, { state: "delivered" }), "delivered")?.code).toBe("production_started");
  });

  it("takes nothing before production, during a refund, or on a job let go", () => {
    expect(milestoneViews(withStart({ status: "pending_pof", pofFileIds: [] }, { state: "accepted" }))[0].canFileMore).toBe(false);
    expect(milestoneViews(withStart({}, { refundHold: true }))[0].canFileMore).toBe(false);
    expect(
      milestoneViews(withStart({}, { shopRecovery: { status: "offered" } as unknown as Order["shopRecovery"] }))[0].canFileMore,
    ).toBe(false);
    expect(proofTarget(withStart({}, { refundHold: true }), "production_started")).toBeNull();
  });

  it("still takes photos while a client's claim holds the money", () => {
    const held = milestoneViews(withStart({}, { payoutHold: true }))[0];
    expect(held.stage).toBe("held");
    expect(held.canFileMore).toBe(true);
  });
});
