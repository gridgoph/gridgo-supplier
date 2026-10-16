import type { Order, ProductionItem } from "@/lib/api";
import { declineTimelineNote } from "@/lib/decline";
import { makeSummary } from "@/lib/jobBrief";
import {
  canRequestChange,
  changeNotice,
  changeReasonError,
  changeRequestsOf,
  currentChangeRequest,
  hasSpecialInstructions,
  instructionsReadAt,
  itemInstructions,
  normalizeChangeRequest,
  presentChangeAlert,
  proposedChangeError,
  type ChangeRequest,
} from "@/lib/orderChanges";
import { canRequestNewDeadline } from "@/lib/reschedule";

function item(partial: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "line_1",
    itemName: "Document printing",
    quantity: 1,
    pricingUnit: "per_page",
    packageQty: null,
    measurement: { pages: 200 },
    structuredSpec: {},
    options: [],
    artworkFileId: null,
    mockupFileId: null,
    ...partial,
  };
}

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "client_1",
    supplierId: "shop_1",
    riderId: null,
    state: "production",
    productId: "product_1",
    title: "Orientation booklets",
    quantity: 1,
    size: "A4",
    material: "Bond",
    deadline: null,
    readyBy: "2099-08-12T08:00:00+08:00",
    address: "Davao City",
    zone: "davao_central",
    totalMinor: 0,
    deliveryFeeMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
    supplierPriceMinor: 400000,
    payoutMilestones: [],
    timeline: [],
    ...partial,
  };
}

/** A request as GRIDGO projects it to the shop: no client total, no fee. */
function raw(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "change_1",
    orderId: "ord_1",
    lineItemId: "line_1",
    status: "pending",
    version: 1,
    extraPrincipalMinor: 32000,
    createdAt: "2026-10-15T07:26:00Z",
    reason: "Covers are not in the listing price.",
    proposedSpec: "Add a clear plastic cover to each booklet.",
    proposedReadyBy: null,
    originalInstructions: "Add a clear plastic cover on each booklet.",
    ...partial,
  };
}

function request(partial: Record<string, unknown> = {}): ChangeRequest {
  return normalizeChangeRequest(raw(partial))!;
}

describe("special instructions", () => {
  it("reads each item's own note and agreed change, in item order", () => {
    const job = order({
      productionItems: [
        item({ id: "line_1", specialInstructions: "Staple on the left." }),
        item({ id: "line_2", itemName: "Cover", specialInstructions: "" }),
        item({
          id: "line_3",
          itemName: "Inserts",
          specialInstructions: "Fold in half.",
          agreedChange: { id: "change_1", proposedSpec: "Fold twice.", appliedAt: "2026-10-15T08:00:00Z" },
        }),
      ],
    });
    expect(itemInstructions(job)).toEqual([
      { lineItemId: "line_1", itemName: "Document printing", text: "Staple on the left.", agreedChange: null },
      { lineItemId: "line_3", itemName: "Inserts", text: "Fold in half.", agreedChange: "Fold twice." },
    ]);
    expect(hasSpecialInstructions(job)).toBe(true);
  });

  it("falls back to the acceptance lines, then to an older order's single note", () => {
    const fromLines = order({
      productionItems: [item()],
      specialInstructionLines: [{ lineItemId: "line_1", text: "Darker lines on page 3." }],
    });
    expect(itemInstructions(fromLines)[0].text).toBe("Darker lines on page 3.");

    const legacy = order({ specialInstructions: "Staple on the left." });
    expect(itemInstructions(legacy)).toEqual([
      { lineItemId: "", itemName: "Orientation booklets", text: "Staple on the left.", agreedChange: null },
    ]);
  });

  it("has nothing to tick on a job without notes", () => {
    expect(hasSpecialInstructions(order({ productionItems: [item({ specialInstructions: "" })] }))).toBe(false);
    expect(hasSpecialInstructions(order())).toBe(false);
  });

  it("says when this shop ticked them, never another shop's tick and never on an offer", () => {
    const ack = { supplierId: "shop_1", at: "2026-10-15T07:25:00Z" };
    expect(instructionsReadAt(order({ specialInstructionsAcknowledgement: ack }))).toBe(ack.at);
    expect(
      instructionsReadAt(order({ specialInstructionsAcknowledgement: { ...ack, supplierId: "shop_before" } })),
    ).toBeNull();
    expect(
      instructionsReadAt(order({ state: "supplier_assigned", specialInstructionsAcknowledgement: ack })),
    ).toBeNull();
    expect(instructionsReadAt(order())).toBeNull();
  });
});

describe("change requests", () => {
  it("reads the shop's projection and drops what it cannot read", () => {
    expect(changeRequestsOf(order({ changeRequests: [raw(), { id: "x", status: "mystery" }, null] }))).toEqual([
      {
        id: "change_1",
        lineItemId: "line_1",
        status: "pending",
        version: 1,
        reason: "Covers are not in the listing price.",
        proposedSpec: "Add a clear plastic cover to each booklet.",
        proposedReadyBy: null,
        extraPrincipalMinor: 32000,
        createdAt: "2026-10-15T07:26:00Z",
        originalInstructions: "Add a clear plastic cover on each booklet.",
        payout: null,
        colourCorrection: null,
      },
    ]);
    expect(normalizeChangeRequest({ changeRequest: raw({ status: "declined" }) })?.status).toBe("declined");
    expect(changeRequestsOf(order({ changeRequests: "nope" }))).toEqual([]);
  });

  it("is about the open request first, else the latest", () => {
    const open = order({ changeRequests: [raw({ id: "a", status: "pending_payment" }), raw({ id: "b", status: "declined" })] });
    expect(currentChangeRequest(open)?.id).toBe("a");
    const settled = order({ changeRequests: [raw({ id: "a", status: "applied" }), raw({ id: "b", status: "declined" })] });
    expect(currentChangeRequest(settled)?.id).toBe("b");
    expect(currentChangeRequest(order())).toBeNull();
  });

  it("can be asked for from the offer until the job is first marked ready", () => {
    for (const state of ["supplier_assigned", "payment_authorized", "production", "supplier_self_qc"]) {
      expect(canRequestChange(order({ state }))).toBe(true);
    }
    expect(canRequestChange(order({ state: "ready_for_dispatch" }))).toBe(false);
    // Sent back to production after it was ready: the window does not reopen.
    expect(
      canRequestChange(order({ timeline: [{ at: "2026-10-15T00:00:00Z", state: "ready_for_dispatch", note: "" }] })),
    ).toBe(false);
  });

  it("takes one request at a time, never beside a waiting deadline request, never on a stopped job", () => {
    expect(canRequestChange(order({ changeRequests: [raw({ status: "pending_confirmation" })] }))).toBe(false);
    expect(canRequestChange(order({ changeRequests: [raw({ status: "declined" })] }))).toBe(true);
    expect(canRequestChange(order({ changeRequests: [raw({ status: "applied" })] }))).toBe(true);
    expect(
      canRequestChange(
        order({
          rescheduleRequest: {
            id: "r",
            orderId: "ord_1",
            reason: "",
            status: "pending",
            requestedAt: "",
            expiresAt: "",
            answeredAt: null,
            resolution: null,
            workHeld: false,
            originalReadyBy: "",
            proposedReadyBy: "",
          },
        }),
      ),
    ).toBe(false);
    expect(canRequestChange(order({ refundHold: true }))).toBe(false);
    expect(canRequestChange(order({ shopRecovery: { id: "rec", status: "awaiting_client" } }))).toBe(false);
  });

  it("keeps a deadline request off the job while a change waits", () => {
    expect(canRequestNewDeadline(order())).toBe(true);
    expect(canRequestNewDeadline(order({ changeRequests: [raw({ status: "pending" })] }))).toBe(false);
    expect(canRequestNewDeadline(order({ changeRequests: [raw({ status: "declined" })] }))).toBe(true);
  });

  it("says every status in words and an icon, and keeps the work as ordered until agreed", () => {
    const labels = ["pending", "pending_payment", "pending_confirmation", "applied", "declined", "closed"].map(
      (status) => changeNotice(request({ status })).chip.label,
    );
    expect(labels).toEqual([
      "Waiting for the client",
      "Approved, waiting for payment",
      "Payment being checked",
      "Approved",
      "Declined",
      "Closed",
    ]);
    for (const status of ["pending", "pending_payment", "pending_confirmation", "declined"]) {
      expect(changeNotice(request({ status })).body).toMatch(/as ordered/);
    }
    expect(changeNotice(request({ status: "applied" })).body).toMatch(/with this change/);
  });

  it("says the shop's own extra and when it is paid, never as money that has moved", () => {
    expect(changeNotice(request()).money).toBe("₱320.00 extra for your shop if the client pays for the change.");
    expect(changeNotice(request({ status: "applied", payout: { status: "pending", amountMinor: 32000 } })).money).toBe(
      "₱320.00 extra for your shop, paid with your last payout part.",
    );
    expect(changeNotice(request({ status: "applied", payout: { status: "released", amountMinor: 32000 } })).money).toBe(
      "₱320.00 extra was released with your last payout part.",
    );
    expect(changeNotice(request({ status: "applied", payout: { status: "superseded", amountMinor: 32000 } })).money).toBe(
      "₱320.00 extra was replaced by the refund settlement.",
    );
    expect(changeNotice(request({ status: "declined" })).money).toMatch(/not agreed/);
    expect(changeNotice(request({ extraPrincipalMinor: 0 })).money).toBeNull();
  });

  it("checks the form against GRIDGO's limits before sending", () => {
    expect(proposedChangeError("  ")).toBe("Say what you will do differently.");
    expect(proposedChangeError("x".repeat(301))).toMatch(/300/);
    expect(proposedChangeError("x".repeat(300))).toBeNull();
    expect(changeReasonError("")).toBe("Tell the client why the job needs this change.");
    expect(changeReasonError("x".repeat(2001))).toMatch(/2,000/);
    expect(changeReasonError("Covers cost extra.")).toBeNull();
  });
});

describe("notices and neighbours", () => {
  it("rewrites GRIDGO's generic change notices in the shop's words", () => {
    expect(presentChangeAlert({ type: "order_change_declined" })).toEqual({
      title: "Change declined",
      body: "The client declined your change. Make the job as ordered.",
    });
    expect(presentChangeAlert({ type: "order_change_applied" })?.title).toBe("Change agreed");
    expect(presentChangeAlert({ type: "order_change_future_thing" })?.title).toBe("Change request update");
    expect(presentChangeAlert({ type: "order_reschedule_requested" })).toBeNull();
  });

  it("declines in GRIDGO's own words when the notes are not possible", () => {
    expect(declineTimelineNote("special_instructions", "")).toBe("Special instructions not possible");
  });

  it("says on the closed docket row that the client wrote something", () => {
    expect(makeSummary(order({ productionItems: [item({ specialInstructions: "Staple left." })] }))).toBe(
      "1 × Document printing · special instructions",
    );
    expect(makeSummary(order({ productionItems: [item()] }))).toBe("1 × Document printing");
  });
});
