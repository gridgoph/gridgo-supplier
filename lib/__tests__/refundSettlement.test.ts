import type { Order, PayoutMilestone, SupplierSettlementPayout } from "@/lib/api";
import { presentAlertBody, presentAlertTitle } from "@/lib/alertStages";
import { humanizeApiError } from "@/lib/apiErrors";
import { ApiError } from "@/lib/api";
import { defaultBriefSection, earningsSummary } from "@/lib/jobBrief";
import { actionsForJob, presentJobStatus, presentOrderState, presentTimelineNote } from "@/lib/jobState";
import {
  earningsSplit,
  keptAfterSettlement,
  milestoneViews,
  nextShopProof,
  settlementPayoutViews,
} from "@/lib/milestones";
import { payoutRows, statementLines, statementMonths, unreleasedMinor } from "@/lib/payout";
import { isAgendaEligible } from "@/lib/schedule";

/**
 * The worked example from gridgo-api#111: shop cost ₱1,000, the 40% start of
 * production already released, and a final entitlement of ₱600 agreed. The
 * two unpaid stages are superseded and a ₱200 settlement payout replaces them.
 * The client's ₱710 refund is theirs and never appears on this app.
 */
function stages(
  status: { delivered?: PayoutMilestone["status"]; issue_window?: PayoutMilestone["status"] } = {},
): PayoutMilestone[] {
  return [
    {
      code: "production_started",
      label: "Start of production",
      releaseRequires: "shop_proof",
      sharePercent: 40,
      amountMinor: 40000,
      status: "released",
      pofFileIds: ["file_start"],
      releasedAt: "2026-09-26T02:00:00.000Z",
      receiptFileId: "file_stage_receipt",
      reference: "GC-400",
    },
    {
      code: "delivered",
      label: "Delivered",
      releaseRequires: "delivery_proof",
      sharePercent: 35,
      amountMinor: 35000,
      status: status.delivered ?? "superseded",
      pofFileIds: [],
      releasedAt: null,
      supersededAt: "2026-09-28T04:20:00.000Z",
      supersededBySettlementId: "rsettle_1",
    },
    {
      code: "issue_window",
      label: "Issue window closed",
      releaseRequires: "issue_window_closed",
      sharePercent: 25,
      amountMinor: 25000,
      status: status.issue_window ?? "superseded",
      pofFileIds: [],
      releasedAt: null,
      supersededAt: "2026-09-28T04:20:00.000Z",
      supersededBySettlementId: "rsettle_1",
    },
  ];
}

function settlementPayout(partial: Partial<SupplierSettlementPayout> = {}): SupplierSettlementPayout {
  return {
    id: "rspay_1",
    settlementId: "rsettle_1",
    orderId: "ord_1",
    amountMinor: 20000,
    status: "pending",
    reference: null,
    receiptFileId: null,
    releasedAt: null,
    createdAt: "2026-09-28T04:20:00.000Z",
    code: "refund_settlement",
    label: "Agreed refund settlement payout",
    ...partial,
  };
}

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "cancelled",
    productId: "prod_flyers",
    title: "Flyers",
    quantity: 500,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Davao",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 115000,
    deliveryFeeMinor: 5000,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    payoutPlanVersion: 2,
    payoutMilestones: stages(),
    payoutHold: false,
    refundHold: true,
    refundDisposition: "cancelled",
    supplierSettlementPayouts: [settlementPayout()],
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-09-28T04:20:00.000Z",
    timeline: [],
    ...partial,
  };
}

/** A job the client has just asked a refund on, before Operations settles it. */
function paused(partial: Partial<Order> = {}): Order {
  return order({
    state: "production",
    refundHold: true,
    refundDisposition: null,
    supplierSettlementPayouts: [],
    payoutMilestones: stages({ delivered: "pending_pof", issue_window: "pending_pof" }).map((stage) =>
      stage.code === "production_started"
        ? { ...stage, status: "pof_attached", releasedAt: null, receiptFileId: null, reference: null }
        : { ...stage, supersededAt: null, supersededBySettlementId: null },
    ),
    ...partial,
  });
}

describe("superseded stages", () => {
  it("never reads a superseded stage as paid", () => {
    const [start, delivered, window] = milestoneViews(order());
    expect(start.stage).toBe("released");
    for (const view of [delivered, window]) {
      expect(view.stage).toBe("superseded");
      expect(view.statusLabel).toBe("Replaced by settlement");
      expect(view.statusLabel).not.toMatch(/paid|released/i);
      expect(view.detail).toMatch(/^Not paid\./);
      expect(view.receiptFileId).toBeNull();
      expect(view.canAddProof).toBe(false);
    }
  });

  it("keeps superseded amounts out of the total and out of what is still to come", () => {
    const split = earningsSplit(order());
    expect(split.supersededMinor).toBe(60000);
    expect(split.releasedMinor).toBe(40000);
    expect(split.awaitingReleaseMinor).toBe(20000);
    expect(split.totalMinor).toBe(60000);
    expect(unreleasedMinor(split)).toBe(20000);
  });

  it("asks for no proof on a settled job", () => {
    expect(nextShopProof(order({ state: "production" }))).toBeNull();
  });
});

describe("the settlement payout", () => {
  it("is separately labelled and waits with GRIDGO until Operations sends it", () => {
    const [view] = settlementPayoutViews(order());
    expect(view).toMatchObject({
      label: "Agreed refund settlement payout",
      amountMinor: 20000,
      stage: "awaiting_release",
      statusLabel: "With GRIDGO",
      receiptFileId: null,
    });
  });

  it("is held while a client report is open", () => {
    const [view] = settlementPayoutViews(order({ payoutHold: true }));
    expect(view.stage).toBe("held");
    expect(earningsSplit(order({ payoutHold: true })).heldMinor).toBe(20000);
  });

  it("is not held by the client's own refund transfer still being paid", () => {
    // refundHold stays true until the client's transfer is recorded; the shop's
    // payout does not wait on it.
    const [view] = settlementPayoutViews(order({ refundHold: true }));
    expect(view.stage).toBe("awaiting_release");
  });

  it("shows its wallet transfer evidence once released", () => {
    const released = settlementPayout({
      status: "released",
      reference: "SHOP-200",
      receiptFileId: "file_payout_receipt",
      releasedAt: "2026-09-28T06:00:00.000Z",
    });
    const [view] = settlementPayoutViews(order({ supplierSettlementPayouts: [released] }));
    expect(view).toMatchObject({
      stage: "released",
      statusLabel: "Released",
      reference: "SHOP-200",
      receiptFileId: "file_payout_receipt",
    });
    expect(earningsSplit(order({ supplierSettlementPayouts: [released] })).releasedMinor).toBe(60000);
  });

  it("reads a later settlement's replacement as not paid", () => {
    const replaced = settlementPayout({ status: "superseded" });
    const [view] = settlementPayoutViews(order({ supplierSettlementPayouts: [replaced] }));
    expect(view.stage).toBe("superseded");
    expect(view.statusLabel).toBe("Replaced by settlement");
    expect(earningsSplit(order({ supplierSettlementPayouts: [replaced] })).totalMinor).toBe(40000);
  });

  it("falls back to GRIDGO's own name when an older API sends no label", () => {
    const [view] = settlementPayoutViews(order({ supplierSettlementPayouts: [settlementPayout({ label: undefined })] }));
    expect(view.label).toBe("Agreed refund settlement payout");
  });

  it("adds released stages and standing settlement items into what the shop keeps", () => {
    expect(keptAfterSettlement(order())).toEqual({ releasedMinor: 40000, settlementMinor: 20000 });
    expect(
      keptAfterSettlement(order({ supplierSettlementPayouts: [settlementPayout({ status: "superseded" })] })),
    ).toEqual({ releasedMinor: 40000, settlementMinor: 0 });
  });
});

describe("a refund request before settlement", () => {
  it("holds every unpaid stage and says why", () => {
    const views = milestoneViews(paused());
    expect(views.map((view) => view.stage)).toEqual(["held", "held", "held"]);
    expect(views[0].detail).toMatch(/asked for a refund/);
    expect(earningsSplit(paused()).held).toBe(true);
  });

  it("offers no step at all, proof included", () => {
    expect(actionsForJob(paused())).toEqual([]);
    expect(actionsForJob(paused({ state: "payment_authorized" }))).toEqual([]);
    expect(actionsForJob(order())).toEqual([]);
  });

  it("speaks over the order state on the chip", () => {
    expect(presentJobStatus(paused())).toMatchObject({ label: "Paused for refund", tone: "warning" });
    expect(presentJobStatus(order())).toMatchObject({ label: "Cancelled and settled" });
    expect(presentJobStatus(order({ state: "completed", refundDisposition: "fulfilled_with_refund" }))).toMatchObject({
      label: "Settled",
    });
  });

  it("opens the earnings row on the job", () => {
    expect(defaultBriefSection(paused())).toBe("earnings");
    expect(defaultBriefSection(order())).toBe("earnings");
  });
});

describe("the job lists", () => {
  it("names a cancelled job instead of calling it in progress", () => {
    expect(presentOrderState("cancelled").label).toBe("Cancelled");
  });

  it("keeps a cancelled job off the agenda", () => {
    expect(isAgendaEligible({ state: "cancelled" })).toBe(false);
  });

  it("sums a settled job as what the shop keeps", () => {
    expect(earningsSummary(order())).toBe("₱600.00 agreed in settlement · ₱400.00 released");
    const released = settlementPayout({ status: "released", releasedAt: "2026-09-28T06:00:00.000Z" });
    expect(earningsSummary(order({ supplierSettlementPayouts: [released] }))).toBe("₱600.00 · settled and released");
    expect(
      earningsSummary(
        order({
          payoutMilestones: stages().map((stage) => ({ ...stage, status: "superseded" as const })),
          supplierSettlementPayouts: [],
        }),
      ),
    ).toBe("Settled · no payout due");
  });

  it("draws the settlement payout on its job's payout row", () => {
    const [row] = payoutRows([order()]);
    expect(row.settlementPayouts).toHaveLength(1);
    expect(row.split.totalMinor).toBe(60000);
  });

  it("keeps a job whose only payout is a settlement on the earnings screen", () => {
    expect(payoutRows([order({ payoutMilestones: [] })])).toHaveLength(1);
  });
});

describe("the statement", () => {
  it("puts a released settlement payout in the month it landed, with its evidence", () => {
    const released = settlementPayout({
      status: "released",
      reference: "SHOP-200",
      receiptFileId: "file_payout_receipt",
      releasedAt: "2026-09-28T06:00:00.000Z",
    });
    const lines = statementLines([order({ supplierSettlementPayouts: [released] })]);
    expect(lines.map((line) => [line.label, line.amountMinor])).toEqual([
      ["Agreed refund settlement payout", 20000],
      ["Start of production", 40000],
    ]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(2);
    expect(lines[0].receiptFileId).toBe("file_payout_receipt");
    expect(statementMonths(lines)).toEqual([
      { key: "2026-09", label: "September 2026", totalMinor: 60000, releaseCount: 2 },
    ]);
  });

  it("never lists a superseded stage or an unsent settlement payout", () => {
    const lines = statementLines([order()]);
    expect(lines.map((line) => line.code)).toEqual(["production_started"]);
  });
});

describe("refund notices and errors", () => {
  it("rewrites the platform's refund notice in the shop's words", () => {
    const alert = {
      type: "refund_attempt",
      title: "Client refund",
      body: "A manual refund payment is reserved.",
    };
    expect(presentAlertTitle(alert)).toBe("Client refund update");
    expect(presentAlertBody(alert)).toBe(
      "Operations is handling the client's side of the refund. Nothing changes for your shop.",
    );
  });

  it("leaves other notices alone", () => {
    const alert = { type: "shop_job_assigned", title: "New job", body: "A job is waiting." };
    expect(presentAlertTitle(alert)).toBe("New job");
    expect(presentAlertBody(alert)).toBe("A job is waiting.");
  });

  it("translates the settlement's timeline note", () => {
    expect(presentTimelineNote("Refund settlement approved; no client transfer recorded yet.")).toBe(
      "Operations settled the refund on this job.",
    );
  });

  it("explains a step GRIDGO refused because the job is paused", () => {
    const error = new ApiError(409, {
      error: "refund_fulfillment_stopped",
      message: "This order is stopped for a refund. Resolve the refund before continuing.",
    });
    expect(humanizeApiError(error, "fallback")).toMatch(/asked for a refund, so this job is paused/);
  });
});
