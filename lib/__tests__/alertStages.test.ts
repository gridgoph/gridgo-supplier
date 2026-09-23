import { ALERT_STAGES, stageForAlert, stageIndexForState } from "@/lib/alertStages";
import type { Notification, Order } from "@/lib/api";

function alert(partial: Partial<Notification> = {}): Notification {
  return {
    id: "ntf_1",
    userId: "user_supplier",
    title: "New job matched to your shop",
    body: "Accept or decline within the hour.",
    read: false,
    at: "2026-08-10T12:00:00.000Z",
    ...partial,
  };
}

function order(id: string, state: string): Order {
  return {
    id,
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state,
    productId: "prod_tarpaulin",
    title: "Test job",
    quantity: 1,
    size: "A4",
    material: "matte",
    deadline: null,
    address: "Davao",
    zone: "davao_central",
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
  };
}

describe("stageIndexForState", () => {
  it("walks the shop's four stages in order", () => {
    expect(stageIndexForState("supplier_assigned")).toBe(0);
    expect(stageIndexForState("production")).toBe(1);
    expect(stageIndexForState("ready_for_dispatch")).toBe(2);
    expect(stageIndexForState("delivered")).toBe(3);
  });

  it("covers every state the shop's own journey passes through", () => {
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
      expect(stageIndexForState(state)).toBeGreaterThanOrEqual(0);
    }
  });

  it("names four stages, all in plain language", () => {
    expect(ALERT_STAGES).toHaveLength(4);
    for (const stage of ALERT_STAGES) expect(stage.label).not.toMatch(/_/);
  });
});

/**
 * An alert is a snapshot of a moment; the job has usually moved on by the time
 * anyone reads it. Showing where the job *is* is the whole point of the track,
 * so the live job wins over whatever the alert was about.
 */
describe("stageForAlert", () => {
  it("prefers where the job actually is over what the alert announced", () => {
    const jobs = [order("ord_1", "out_for_delivery")];
    const stage = stageForAlert(
      alert({ orderId: "ord_1", type: "supplier_assignment_final_price" }),
      jobs,
    );
    expect(stage).toBe(3);
  });

  it("puts a production reminder on Printing even when the job has left the list", () => {
    expect(stageForAlert(alert({ orderId: "ord_gone", type: "shop_production_inactive" }), [])).toBe(1);
  });

  it("falls back to the alert's own event when the job has left the list", () => {
    expect(stageForAlert(alert({ orderId: "ord_gone", type: "order_delivered" }), [])).toBe(3);
    expect(stageForAlert(alert({ orderId: "ord_gone", type: "rider_assigned" }), [])).toBe(2);
  });

  /** An accreditation decision has no printing stage and must not be given one. */
  it("draws no track on an alert that is not about a job", () => {
    expect(stageForAlert(alert({ type: "account_approved" }), [])).toBe(-1);
    expect(stageForAlert(alert(), [])).toBe(-1);
  });

  it("draws no track when nothing can place the alert", () => {
    expect(stageForAlert(alert({ orderId: "ord_gone", type: "something_new" }), [])).toBe(-1);
  });
});
