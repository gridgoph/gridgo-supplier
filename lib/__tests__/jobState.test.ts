import {
  actionsForJob,
  allSelfQcComplete,
  findAction,
  isAwaitingDecision,
  isInProductionPipeline,
  JOB_JOURNEY,
  journeyIndex,
  mostUrgentJob,
  needsSupplierAction,
  presentOrderState,
  presentTimelineActor,
  primaryAction,
  routeForAction,
  SELF_QC_CHECKS,
  waitingOn,
} from "@/lib/jobState";
import type { Order } from "@/lib/api";

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
    totalMinor: 10000,
    deliveryFeeMinor: 1000,
    paymentMethod: null,
    paymentStatus: "unpaid",
    codEligible: true,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("presentOrderState", () => {
  it("maps supplier states to plain labels without snake_case", () => {
    expect(presentOrderState("supplier_assigned").label).toBe("Needs decision");
    expect(presentOrderState("payment_authorized").label).toBe("Paid");
    expect(presentOrderState("ready_for_dispatch").label).toBe("Ready for pickup");
    expect(presentOrderState("supplier_assigned").label).not.toMatch(/_/);
  });

  it("always pairs tone with an icon name", () => {
    const p = presentOrderState("production");
    expect(p.tone).toBeTruthy();
    expect(p.icon).toBeTruthy();
  });
});

describe("actionsForJob", () => {
  it("offers accept and decline only when assigned", () => {
    const actions = actionsForJob("supplier_assigned");
    expect(actions.map((a) => a.kind)).toEqual(["accept", "decline"]);
    expect(actions.filter((a) => a.primary)).toHaveLength(1);
    expect(actions.find((a) => a.kind === "decline")?.destructive).toBe(true);
  });

  it("sends an accepted job to the client as a proof, not straight to payment", () => {
    const next = primaryAction("supplier_accepted");
    expect(next?.kind).toBe("send_proof");
    // A proof moves the order by attaching a file, so there is no target state.
    expect(next?.targetState).toBeNull();
  });

  it("asks for a corrected proof when the client rejected one", () => {
    expect(primaryAction("supplier_proof_changes_requested")?.kind).toBe("resend_proof");
  });

  it("only offers payment once the client has approved the proof", () => {
    expect(primaryAction("supplier_proof_review")).toBeNull();
    expect(primaryAction("supplier_proof_approved")?.targetState).toBe("awaiting_payment");
  });

  it("starts production only after payment is authorized", () => {
    expect(primaryAction("payment_authorized")?.label).toBe("Start production");
    expect(primaryAction("awaiting_payment")).toBeNull();
  });

  it("walks production → self-QC → ready for pickup", () => {
    expect(primaryAction("production")?.targetState).toBe("supplier_self_qc");
    expect(primaryAction("supplier_self_qc")?.targetState).toBe("ready_for_dispatch");
  });

  it("returns no actions for terminal handoff states", () => {
    expect(actionsForJob("ready_for_dispatch")).toEqual([]);
    expect(actionsForJob("completed")).toEqual([]);
  });
});

describe("job urgency helpers", () => {
  it("flags awaiting decision and production pipeline", () => {
    expect(isAwaitingDecision(job({ id: "a", state: "supplier_assigned" }))).toBe(true);
    expect(isInProductionPipeline(job({ id: "b", state: "production" }))).toBe(true);
    expect(isInProductionPipeline(job({ id: "c", state: "supplier_accepted" }))).toBe(false);
  });

  it("picks the most urgent actionable job by rank then deadline", () => {
    const urgent = mostUrgentJob([
      job({
        id: "later-assigned",
        state: "supplier_assigned",
        deadline: "2026-08-20T10:00:00+08:00",
      }),
      job({
        id: "soon-assigned",
        state: "supplier_assigned",
        deadline: "2026-08-10T10:00:00+08:00",
      }),
      job({
        id: "production",
        state: "production",
        deadline: "2026-08-09T10:00:00+08:00",
      }),
    ]);
    expect(urgent?.id).toBe("soon-assigned");
  });

  it("returns null when nothing needs supplier action", () => {
    expect(mostUrgentJob([job({ id: "x", state: "ready_for_dispatch" })])).toBeNull();
    expect(needsSupplierAction(job({ id: "y", state: "awaiting_payment" }))).toBe(false);
  });
});

describe("self-QC checklist", () => {
  it("requires every item before complete", () => {
    expect(allSelfQcComplete({})).toBe(false);
    const checked: Record<string, boolean> = {};
    for (const item of SELF_QC_CHECKS) checked[item.id] = true;
    expect(allSelfQcComplete(checked)).toBe(true);
  });
});

describe("timeline presentation", () => {
  it("names known actors without exposing raw ids as the only label", () => {
    expect(presentTimelineActor("user_supplier")).toBe("You");
    expect(presentTimelineActor("system")).toBe("GRIDGO");
    expect(presentTimelineActor("user_client")).toBe("Client");
  });
});

describe("action copy", () => {
  it("gives every action a consequence and a matching result label", () => {
    for (const state of [
      "supplier_assigned",
      "supplier_accepted",
      "payment_authorized",
      "production",
      "supplier_self_qc",
    ]) {
      for (const action of actionsForJob(state)) {
        expect(action.consequence.length).toBeGreaterThan(0);
        expect(action.resultLabel).not.toMatch(/_/);
      }
    }
  });
});

describe("routeForAction", () => {
  it("sends every action to its own flow screen", () => {
    expect(routeForAction("accept")).toBe("/job/[id]/accept");
    expect(routeForAction("decline")).toBe("/job/[id]/decline");
    expect(routeForAction("self_qc")).toBe("/job/[id]/self-qc");
    expect(routeForAction("ready_for_pickup")).toBe("/job/[id]/handoff");
  });

  it("sends plain stage moves to the shared update screen", () => {
    expect(routeForAction("start_production")).toBe("/job/[id]/advance");
    expect(routeForAction("request_payment")).toBe("/job/[id]/advance");
  });
});

describe("findAction", () => {
  it("only finds an action that is valid in the job's current state", () => {
    expect(findAction("supplier_assigned", "accept")?.targetState).toBe("supplier_accepted");
    expect(findAction("production", "accept")).toBeNull();
  });
});

describe("journeyIndex", () => {
  it("moves forward through the shop's sequence", () => {
    const order = [
      "supplier_assigned",
      "supplier_accepted",
      "supplier_proof_review",
      "awaiting_payment",
      "production",
      "supplier_self_qc",
      "ready_for_dispatch",
      "delivered",
    ];
    expect(order.map(journeyIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the proof round trip on one step rather than going backwards", () => {
    expect(journeyIndex("supplier_proof_changes_requested")).toBe(
      journeyIndex("supplier_proof_review"),
    );
    expect(journeyIndex("supplier_proof_approved")).toBe(journeyIndex("supplier_proof_review"));
  });

  it("covers every step so the track never has a gap", () => {
    expect(JOB_JOURNEY).toHaveLength(8);
    expect(journeyIndex("approved_for_matching")).toBe(-1);
  });
});

describe("waitingOn", () => {
  it("names whose move it is when the shop has nothing to do", () => {
    expect(waitingOn("supplier_proof_review").title).toContain("client");
    expect(waitingOn("awaiting_payment").title).toContain("payment");
    expect(waitingOn("ready_for_dispatch").title).toContain("rider");
  });

  it("never leaks a state string into the copy", () => {
    for (const state of [
      "supplier_proof_review",
      "awaiting_payment",
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
