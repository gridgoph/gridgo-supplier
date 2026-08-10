import type { Notification, Order } from "@/lib/api";

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
  { id: "printing", label: "Printing", states: ["payment_authorized", "production"] },
  {
    id: "pickup",
    label: "Pickup",
    states: ["supplier_self_qc", "ready_for_dispatch", "rider_assigned"],
  },
  {
    id: "delivered",
    label: "Delivered",
    states: [
      "picked_up",
      "out_for_delivery",
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
