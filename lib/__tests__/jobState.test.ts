import {
  actionsForJob,
  allSelfQcComplete,
  isAwaitingDecision,
  isInProductionPipeline,
  mostUrgentJob,
  needsSupplierAction,
  presentOrderState,
  presentTimelineActor,
  primaryAction,
  SELF_QC_CHECKS,
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
    expect(presentOrderState("payment_authorized").label).toBe("Paid — start production");
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

  it("sends accepted work to client payment", () => {
    expect(primaryAction("supplier_accepted")?.targetState).toBe("awaiting_payment");
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
