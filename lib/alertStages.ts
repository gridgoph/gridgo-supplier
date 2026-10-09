import type { Notification, Order } from "@/lib/api";
import { presentPickupIssueNotice } from "@/lib/pickupCheck";
import { presentListingAlert } from "@/lib/listingReview";
import { presentCallAlert } from "@/lib/orderCall";
import { presentLapseAlert } from "@/lib/productionLapse";
import { presentRefundAlert } from "@/lib/refund";
import { presentRescheduleAlert } from "@/lib/reschedule";
import { presentShopRecoveryAlert } from "@/lib/shopRecovery";

/** The alert type a failed or resolved counter check reaches the shop as. */
export const PICKUP_ISSUE_ALERT = "shop_pickup_issue_changed";

/**
 * An alert's body in the shop's words. A failed counter check arrives with
 * the platform's check codes, which must not reach a shop's screen, and a
 * client refund notice arrives in words written for the client and Operations
 * (`lib/refund.ts`). A late-production notice carries a raw timestamp
 * (`lib/productionLapse.ts`). A job a shop let go and a deadline request both
 * arrive in words written for the client (`lib/shopRecovery.ts`,
 * `lib/reschedule.ts`). A listing review or take-down notice is said in the
 * board's words (`lib/listingReview.ts`). A call from the rider arrives in
 * GRIDGO's generic "order" words (`lib/orderCall.ts`).
 */
export function presentAlertBody(alert: Pick<Notification, "type" | "body">): string {
  const rewritten = rewrite(alert);
  if (rewritten) return rewritten.body;
  return alert.type === PICKUP_ISSUE_ALERT ? presentPickupIssueNotice(alert.body) : alert.body;
}

/** An alert's title in the shop's words. */
export function presentAlertTitle(alert: Pick<Notification, "type" | "title" | "body">): string {
  return rewrite(alert)?.title ?? alert.title;
}

function rewrite(alert: Pick<Notification, "type" | "body">): { title: string; body: string } | null {
  return (
    presentCallAlert(alert) ??
    presentRefundAlert(alert) ??
    presentLapseAlert(alert) ??
    presentShopRecoveryAlert(alert) ??
    presentRescheduleAlert(alert) ??
    presentListingAlert(alert)
  );
}

/**
 * Where the job behind an alert has actually got to.
 *
 * The legacy GRIDGO notification card showed a job's stage inline, so a person
 * reading an alert could see the state of the thing without opening it. That is
 * the idea worth keeping, and this app owes a shop the shop's own four stages
 * rather than the client's.
 *
 * Two sources, in order: the live order, because an alert is a snapshot and the
 * job has usually moved on since; and the alert's own type when the job is not
 * in the shop's list any more. Deriving only from the type would tell a shop
 * where the job *was*, which is exactly the thing the indicator is for.
 */

export type AlertStageId = "accepted" | "printing" | "pickup" | "delivered";

export type AlertStage = {
  id: AlertStageId;
  label: string;
  /** Order states this stage covers, in the shop's journey. */
  states: readonly string[];
};

export const ALERT_STAGES: readonly AlertStage[] = [
  {
    id: "accepted",
    label: "Accepted",
    states: [
      "supplier_assigned",
      "supplier_accepted",
      "awaiting_downpayment",
      "downpayment_review",
    ],
  },
  { id: "printing", label: "Printing", states: ["payment_authorized", "production", "supplier_self_qc"] },
  {
    id: "pickup",
    label: "Pickup",
    states: ["ready_for_dispatch", "rider_assigned"],
  },
  {
    id: "delivered",
    label: "Delivered",
    states: [
      "picked_up",
      "out_for_delivery",
      "awaiting_collection",
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ],
  },
] as const;

export function stageIndexForState(state: string): number {
  return ALERT_STAGES.findIndex((stage) => stage.states.some((s) => s === state));
}

/** Fallback when the job is no longer in the shop's list. */
function stageIndexForType(type: string | undefined): number {
  if (!type) return -1;
  if (type === "shop_production_inactive") return 1;
  // Before "issue": a pickup issue is at the counter, not after delivery.
  if (type === PICKUP_ISSUE_ALERT) return 2;
  if (type.includes("delivered") || type.includes("payout") || type.includes("issue")) return 3;
  if (type.includes("pickup") || type.includes("dispatch") || type.includes("rider")) return 2;
  if (type.includes("production") || type.includes("printing")) return 1;
  if (type.includes("assign") || type.includes("payment") || type.includes("downpayment")) {
    return 0;
  }
  return -1;
}

/**
 * The stage to draw on an alert, or -1 when it is not about a job at all —
 * an accreditation decision has no printing stage and must not be given one.
 */
export function stageForAlert(alert: Notification, jobs: Order[]): number {
  const job = alert.orderId ? jobs.find((candidate) => candidate.id === alert.orderId) : null;
  if (job) {
    const index = stageIndexForState(job.state);
    if (index >= 0) return index;
  }
  if (!alert.orderId) return -1;
  return stageIndexForType(alert.type);
}
