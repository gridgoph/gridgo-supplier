import type { Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Protected-payment presentation derived only from order fields the demo API
 * returns. There is no supplier payout ledger endpoint — never invent amounts.
 *
 * Terminology: always "Protected payment", never "GRIDGO escrow".
 */

export type SettlementState =
  | "not_started"
  | "held"
  | "settling"
  | "released"
  | "unknown";

export type ProtectedPayment = {
  orderId: string;
  title: string;
  /** Print total from the order — delivery fee is not supplier revenue. */
  grossMinor: number;
  deliveryFeeMinor: number;
  /**
   * Commission is not returned by the demo API. Always null; UI must say so.
   */
  commissionMinor: number | null;
  /**
   * Net cannot be computed without commission. Null when unknown.
   */
  netMinor: number | null;
  settlement: SettlementState;
  settlementLabel: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** Honest reason when funds are held or unavailable. */
  holdReason: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
};

const TERMINAL_SETTLED = new Set(["payout_released"]);
const COMPLETED_LIKE = new Set(["completed", "payout_released"]);
const HELD_STATES = new Set([
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "issue_window_open",
]);

export function deriveProtectedPayment(order: Order): ProtectedPayment {
  const grossMinor = order.totalMinor;
  const settlement = settlementFromOrder(order);
  const { label, tone, icon, holdReason } = settlementPresentation(settlement, order);

  return {
    orderId: order.id,
    title: order.title,
    grossMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    commissionMinor: null,
    netMinor: null,
    settlement,
    settlementLabel: label,
    tone,
    icon,
    holdReason,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
  };
}

export function settlementFromOrder(order: Pick<Order, "state" | "paymentStatus">): SettlementState {
  if (TERMINAL_SETTLED.has(order.state)) return "released";
  if (order.state === "completed") return "settling";
  if (order.paymentStatus === "authorized" || HELD_STATES.has(order.state)) return "held";
  if (order.paymentStatus === "unpaid" || order.paymentStatus === "pending") return "not_started";
  return "unknown";
}

function settlementPresentation(
  settlement: SettlementState,
  order: Pick<Order, "state" | "paymentStatus">,
): {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  holdReason: string | null;
} {
  switch (settlement) {
    case "released":
      return {
        label: "Released",
        tone: "success",
        icon: "circle-check",
        holdReason: null,
      };
    case "settling":
      return {
        label: "Ready to release",
        tone: "info",
        icon: "clock",
        holdReason: "Job completed. Operations releases protected payment from the demo ledger.",
      };
    case "held":
      return {
        label: "Held",
        tone: "warning",
        icon: "clock",
        holdReason: holdReasonFor(order),
      };
    case "not_started":
      return {
        label: "Not paid yet",
        tone: "neutral",
        icon: "clock",
        holdReason: "Client has not authorised payment for this job.",
      };
    default:
      return {
        label: "Status unavailable",
        tone: "neutral",
        icon: "triangle-alert",
        holdReason: "Demo ledger does not expose a settlement state for this job.",
      };
  }
}

function holdReasonFor(order: Pick<Order, "state">): string {
  if (order.state === "issue_window_open") {
    return "Held during the post-delivery issue window.";
  }
  if (
    order.state === "production" ||
    order.state === "supplier_self_qc" ||
    order.state === "payment_authorized"
  ) {
    return "Held until production, handoff, and delivery complete.";
  }
  if (
    order.state === "ready_for_dispatch" ||
    order.state === "rider_assigned" ||
    order.state === "picked_up" ||
    order.state === "out_for_delivery"
  ) {
    return "Held until the rider completes delivery.";
  }
  if (order.state === "delivered") {
    return "Held while delivery is confirmed.";
  }
  return "Protected payment is held until the job settles.";
}

/** Jobs that should appear on the Protected payment list. */
export function isPayoutRelevant(order: Pick<Order, "state" | "paymentStatus">): boolean {
  if (order.paymentStatus === "authorized" || order.paymentStatus === "collected") return true;
  if (HELD_STATES.has(order.state) || COMPLETED_LIKE.has(order.state)) return true;
  if (order.state === "awaiting_payment" || order.state === "supplier_accepted") return true;
  return false;
}

export function summarizePayouts(jobs: Order[]): {
  heldCount: number;
  releasedCount: number;
  heldGrossMinor: number;
  /** True when commission/net cannot be shown from API data. */
  amountsPartial: true;
} {
  const rows = jobs.filter(isPayoutRelevant).map(deriveProtectedPayment);
  let heldCount = 0;
  let releasedCount = 0;
  let heldGrossMinor = 0;
  for (const row of rows) {
    if (row.settlement === "held" || row.settlement === "settling") {
      heldCount += 1;
      heldGrossMinor += row.grossMinor;
    }
    if (row.settlement === "released") releasedCount += 1;
  }
  return { heldCount, releasedCount, heldGrossMinor, amountsPartial: true };
}

/** Human label for payment method — never snake_case. */
export function presentPaymentMethod(method: string | null): string {
  if (!method) return "Not set";
  if (method === "pilot_credit") return "Pilot Credits";
  if (method === "cod") return "Cash on delivery";
  return method.replaceAll("_", " ");
}
