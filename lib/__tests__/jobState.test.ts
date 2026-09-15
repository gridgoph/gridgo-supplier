import {
  actionsForJob,
  findAction,
  isAwaitingDecision,
  isInProductionPipeline,
  JOB_JOURNEY,
  journeyIndex,
  needsSupplierAction,
  presentOrderState,
  presentTimelineActor,
  presentTimelineNote,
  primaryAction,
  routeForAction,
  waitingOn,
} from "@/lib/jobState";
import type { MilestoneCode, Order, PayoutMilestone } from "@/lib/api";

const SHARES: Record<MilestoneCode, number> = {
  printing: 50,
  packaging_qc: 15,
  delivered: 25,
  retention: 10,
};

/** Milestones as the platform creates them: split the shop's own price. */
function milestones(
  overrides: Partial<Record<MilestoneCode, PayoutMilestone["status"]>> = {},
  supplierPriceMinor = 100000,
): PayoutMilestone[] {
  return (Object.keys(SHARES) as MilestoneCode[]).map((code) => ({
    code,
    sharePercent: SHARES[code],
    amountMinor: Math.round((supplierPriceMinor * SHARES[code]) / 100),
    status: overrides[code] ?? "pending_pof",
    pofFileIds: overrides[code] && overrides[code] !== "pending_pof" ? ["file_1"] : [],
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
    downpaymentMinor: 84375,
    balanceMinor: 28125,
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

/** A job whose evidence is all filed, so only the forward step is offered. */
function filed(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return job({
    ...partial,
    payoutMilestones: milestones({ printing: "pof_attached", packaging_qc: "pof_attached" }),
  });
}

describe("presentOrderState", () => {
  it("maps supplier states to plain labels without snake_case", () => {
    expect(presentOrderState("supplier_assigned").label).toBe("Needs decision");
    expect(presentOrderState("awaiting_downpayment").label).toBe("Awaiting downpayment");
    expect(presentOrderState("ready_for_dispatch").label).toBe("Ready for pickup");
    expect(presentOrderState("supplier_assigned").label).not.toMatch(/_/);
  });

  it("always pairs tone with an icon name", () => {
    const p = presentOrderState("production");
    expect(p.tone).toBeTruthy();
    expect(p.icon).toBeTruthy();
  });

  it("has plain language for every v2 state a shop can reach", () => {
    const states = [
      "supplier_assigned",
      "awaiting_downpayment",
      "downpayment_review",
      "payment_authorized",
      "production",
      "supplier_self_qc",
      "ready_for_dispatch",
      "rider_assigned",
      "picked_up",
      "out_for_delivery",
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ];
    for (const state of states) {
      expect(presentOrderState(state).label).not.toMatch(/_/);
    }
  });
});

describe("actionsForJob", () => {
  it("offers accept and decline only when assigned", () => {
    const actions = actionsForJob(job({ id: "a", state: "supplier_assigned" }));
    expect(actions.map((a) => a.kind)).toEqual(["accept", "decline"]);
    expect(actions.filter((a) => a.primary)).toHaveLength(1);
    expect(actions.find((a) => a.kind === "decline")?.destructive).toBe(true);
  });

  it("has nothing for the shop to do while the client pays", () => {
    expect(primaryAction(job({ id: "b", state: "awaiting_downpayment" }))).toBeNull();
    expect(primaryAction(job({ id: "c", state: "downpayment_review" }))).toBeNull();
  });

  it("starts production once the downpayment is confirmed", () => {
    expect(primaryAction(job({ id: "d", state: "payment_authorized" }))?.label).toBe(
      "Start production",
    );
  });

  /**
   * The whole point of the v2 model: half the job's money waits on a photo, so
   * that photo outranks walking the job forward without it.
   */
  it("puts an owed proof ahead of the forward step, and keeps both", () => {
    const actions = actionsForJob(job({ id: "e", state: "production" }));
    expect(actions.map((a) => a.kind)).toEqual(["add_proof", "ready_for_pickup"]);
    expect(actions[0].primary).toBe(true);
    expect(actions[0].milestoneCode).toBe("printing");
    // Filing a proof is not a transition — it moves money, not state.
    expect(actions[0].targetState).toBeNull();
    // Exactly one primary, so the screen keeps one yellow control.
    expect(actions.filter((a) => a.primary)).toHaveLength(1);
  });

  it("asks for the packing proof once printing is filed", () => {
    const actions = actionsForJob(
      job({ id: "f", state: "supplier_self_qc", payoutMilestones: milestones({ printing: "pof_attached" }) }),
    );
    expect(actions[0].kind).toBe("add_proof");
    expect(actions[0].milestoneCode).toBe("packaging_qc");
  });

  it("moves production directly to rider pickup once evidence is filed", () => {
    expect(primaryAction(filed({ id: "g", state: "production" }))?.targetState).toBe(
      "ready_for_dispatch",
    );
    expect(primaryAction(filed({ id: "h", state: "supplier_self_qc" }))?.targetState).toBe(
      "ready_for_dispatch",
    );
  });

  it("still offers an unfiled proof after the job has left the floor", () => {
    const actions = actionsForJob(job({ id: "i", state: "rider_assigned" }));
    expect(actions.map((a) => a.kind)).toEqual(["add_proof"]);
  });

  it("offers nothing once every proof is filed and the job has moved on", () => {
    expect(actionsForJob(filed({ id: "j", state: "ready_for_dispatch" }))).toEqual([]);
    expect(actionsForJob(filed({ id: "k", state: "completed" }))).toEqual([]);
  });

  /** A claim freezes the payout; filing more evidence would change nothing. */
  it("stops asking for evidence while a claim holds the payout", () => {
    expect(actionsForJob(job({ id: "l", state: "production", payoutHold: true }))).toEqual([
      expect.objectContaining({ kind: "ready_for_pickup", primary: true }),
    ]);
  });

  it("never offers the retired proof loop or a payment request", () => {
    const kinds = new Set(
      [
        "supplier_assigned",
        "awaiting_downpayment",
        "payment_authorized",
        "production",
        "supplier_self_qc",
        "ready_for_dispatch",
      ].flatMap((state) => actionsForJob(job({ id: state, state })).map((a) => a.kind)),
    );
    expect(kinds.has("send_proof" as never)).toBe(false);
    expect(kinds.has("request_payment" as never)).toBe(false);
  });
});

describe("job urgency helpers", () => {
  it("flags awaiting decision and production pipeline", () => {
    expect(isAwaitingDecision(job({ id: "a", state: "supplier_assigned" }))).toBe(true);
    expect(isInProductionPipeline(job({ id: "b", state: "production" }))).toBe(true);
    expect(isInProductionPipeline(job({ id: "c", state: "awaiting_downpayment" }))).toBe(false);
  });

  /** Ranking moved to `lib/homeBoard` — one ordering, tested there. */
  it("knows when nothing needs supplier action", () => {
    expect(needsSupplierAction(filed({ id: "x", state: "ready_for_dispatch" }))).toBe(false);
    expect(needsSupplierAction(job({ id: "y", state: "awaiting_downpayment" }))).toBe(false);
  });
});

describe("timeline presentation", () => {
  it("names known actors without exposing raw ids as the only label", () => {
    expect(presentTimelineActor("user_supplier")).toBe("You");
    expect(presentTimelineActor("system")).toBe("GRIDGO");
    expect(presentTimelineActor("user_client")).toBe("Client");
  });

  /**
   * Seen on a real job: the platform composes a failed-pickup note from the
   * rider's check codes, so "Pickup blocked and escalated: visible_defects"
   * put a snake_case identifier on a shop's timeline.
   */
  it("translates the platform's pickup check codes out of a note", () => {
    const note = presentTimelineNote(
      "Pickup blocked and escalated: visible_defects, packaging_integrity",
    );
    expect(note).not.toMatch(/_/);
    expect(note).toContain("visible defects");
    expect(note).toContain("the packing");
  });

  it("leaves a note a person wrote alone", () => {
    const written = "Colours matched the proof; packed flat in two tubes.";
    expect(presentTimelineNote(written)).toBe(written);
  });

  it("covers every one of the rider's six checks", () => {
    const codes = [
      "quantity_match",
      "specification_match",
      "visible_defects",
      "packaging_integrity",
      "documentation",
      "supplier_sign_off",
    ];
    expect(presentTimelineNote(`Pickup blocked and escalated: ${codes.join(", ")}`)).not.toMatch(
      /_/,
    );
  });
});

describe("action copy", () => {
  it("gives every action a consequence and a matching result label", () => {
    for (const state of [
      "supplier_assigned",
      "payment_authorized",
      "production",
      "supplier_self_qc",
    ]) {
      for (const action of actionsForJob(job({ id: state, state }))) {
        expect(action.consequence.length).toBeGreaterThan(0);
        expect(action.label).not.toMatch(/_/);
        expect(action.resultLabel).not.toMatch(/_/);
      }
    }
  });
});

describe("routeForAction", () => {
  it("sends every action to its own flow screen", () => {
    expect(routeForAction("accept")).toBe("/job/[id]/accept");
    expect(routeForAction("decline")).toBe("/job/[id]/decline");
    expect(routeForAction("add_proof")).toBe("/job/[id]/fulfilment");
    expect(routeForAction("ready_for_pickup")).toBe("/job/[id]/handoff");
  });

  it("sends plain stage moves to the shared update screen", () => {
    expect(routeForAction("start_production")).toBe("/job/[id]/advance");
  });
});

describe("findAction", () => {
  it("only finds an action that is valid in the job's current state", () => {
    // Accepting moves the job straight to production being payable. There is
    // no quote step: the client bought this shop's listing at its own price
    // and was given a date before the job ever arrived here.
    expect(findAction(job({ id: "a", state: "supplier_assigned" }), "accept")?.targetState).toBe(
      "payment_authorized",
    );
    expect(findAction(job({ id: "b", state: "production" }), "accept")).toBeNull();
  });
});

describe("journeyIndex", () => {
  it("moves forward through the shop's sequence", () => {
    const order = [
      "supplier_assigned",
      "awaiting_downpayment",
      "payment_authorized",
      "supplier_self_qc",
      "ready_for_dispatch",
      "delivered",
      "completed",
    ];
    expect(order.map(journeyIndex)).toEqual([0, 1, 2, 2, 3, 4, 5]);
  });

  it("keeps the payment round trip on one step rather than going backwards", () => {
    expect(journeyIndex("downpayment_review")).toBe(journeyIndex("awaiting_downpayment"));
    expect(journeyIndex("production")).toBe(journeyIndex("payment_authorized"));
  });

  it("covers every step so the track never has a gap", () => {
    expect(JOB_JOURNEY).toHaveLength(6);
    expect(journeyIndex("approved_for_matching")).toBe(-1);
  });

  it("has no step for the retired proof round trip", () => {
    expect(journeyIndex("supplier_proof_review")).toBe(-1);
    expect(journeyIndex("awaiting_payment")).toBe(-1);
  });
});

describe("waitingOn", () => {
  it("names whose move it is when the shop has nothing to do", () => {
    expect(waitingOn("awaiting_downpayment").title).toContain("client");
    expect(waitingOn("downpayment_review").title).toContain("GRIDGO");
    expect(waitingOn("ready_for_dispatch").title).toContain("rider");
  });

  it("never leaks a state string into the copy", () => {
    for (const state of [
      "supplier_accepted",
      "awaiting_downpayment",
      "downpayment_review",
      "ready_for_dispatch",
      "picked_up",
      "completed",
      "something_unmapped",
    ]) {
      const result = waitingOn(state);
      expect(result.title).not.toMatch(/_/);
      expect(result.body).not.toMatch(/_/);
    }
  });
});
