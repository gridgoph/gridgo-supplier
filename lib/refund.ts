import type { Notification, Order } from "@/lib/api";
import { formatPhp } from "@/lib/money";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * A client refund, as far as it is this shop's business.
 *
 * The refund itself belongs to the client and Operations (gridgo-api
 * `docs/REFUNDS_API.md`): the client's receiving QR, the amount returned to
 * them and the transfer that paid it never reach this app, and nothing here
 * may guess at them. What the shop does need is narrow and it is all here:
 *
 * - **Work stops** the moment a refund is requested (`refundHold`), and
 *   GRIDGO refuses the next production step until Operations settles it.
 * - **Settling closes the job** (`refundDisposition`): the stages not yet
 *   paid are replaced by one agreed settlement payout, read in
 *   `lib/milestones.ts`. Money already released to the shop is never taken
 *   back — the platform refuses a settlement that would, so that promise is
 *   safe to make on screen.
 * - **Notices** arrive for every step of the client's refund. The ones about
 *   the client's own transfer change nothing for the shop and say so, without
 *   repeating what the platform told the client.
 */

export type RefundStanding = "none" | "paused" | "settled";

export function refundStanding(order: Pick<Order, "refundHold" | "refundDisposition">): RefundStanding {
  if (order.refundDisposition) return "settled";
  if (order.refundHold === true) return "paused";
  return "none";
}

export type RefundNotice = {
  /** The chip above the panel: where the refund stands. */
  chipLabel: string;
  title: string;
  body: string;
  tone: StatusTone;
  icon: StatusIconName;
};

/** What the shop keeps once a refund is settled, split the way it reaches them. */
export type KeptAmounts = {
  /** Original stages GRIDGO released before the settlement. */
  releasedMinor: number;
  /** The agreed settlement payout(s) still standing, paid or not. */
  settlementMinor: number;
};

function keptSentence({ releasedMinor, settlementMinor }: KeptAmounts): string {
  const kept = releasedMinor + settlementMinor;
  if (releasedMinor > 0 && settlementMinor > 0) {
    return `You keep ${formatPhp(kept)} in total: ${formatPhp(releasedMinor)} already released to you, and a ${formatPhp(settlementMinor)} settlement payout from Operations.`;
  }
  if (settlementMinor > 0) {
    return `You keep ${formatPhp(settlementMinor)}, paid as one settlement payout from Operations.`;
  }
  if (releasedMinor > 0) {
    return `You keep the ${formatPhp(releasedMinor)} already released to you. Nothing more is due on this job.`;
  }
  return "No payout is due to your shop on this job.";
}

/**
 * The panel the job workspace draws in place of "whose move it is", or null
 * when no refund touches the job. `kept` is only read once it is settled.
 */
export function refundNotice(
  order: Pick<Order, "refundHold" | "refundDisposition">,
  kept: KeptAmounts,
): RefundNotice | null {
  const standing = refundStanding(order);
  if (standing === "paused") {
    return {
      chipLabel: "Refund requested",
      title: "Work is paused for a refund review",
      body: "The client asked GRIDGO for a refund, so this job is stopped. Do not print, pack or hand anything over until Operations settles it. They will agree with you what you keep for work already done, and money already released to you stays yours.",
      tone: "warning",
      icon: "clock",
    };
  }
  if (standing === "settled") {
    const fulfilled = order.refundDisposition === "fulfilled_with_refund";
    return {
      chipLabel: "Refund settled",
      title: fulfilled ? "Settled after delivery" : "Settled and closed",
      body: `${fulfilled ? "Operations settled a refund with the client after delivery." : "Operations settled the client's refund, and this job is closed. There is nothing more to make."} ${keptSentence(kept)}`,
      tone: "neutral",
      icon: "circle-check",
    };
  }
  return null;
}

/** The job's chip while a refund is open or once it is settled. */
export function refundStatus(
  order: Pick<Order, "refundHold" | "refundDisposition">,
): { label: string; tone: StatusTone; icon: StatusIconName } | null {
  const standing = refundStanding(order);
  if (standing === "paused") return { label: "Paused for refund", tone: "warning", icon: "clock" };
  if (standing === "settled") {
    return order.refundDisposition === "fulfilled_with_refund"
      ? { label: "Settled", tone: "neutral", icon: "circle-check" }
      : { label: "Cancelled and settled", tone: "neutral", icon: "circle-x" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

/**
 * The shop's words for each refund notice. The platform writes one body for
 * every recipient, so the client's transfer steps ("reserved", "needs
 * reconciliation", "receiving QR changed") would otherwise reach a shop that
 * has no part in them.
 */
const REFUND_ALERTS: Record<string, { title: string; body: string }> = {
  refund_requested: {
    title: "Job paused for a refund review",
    body: "The client asked for a refund. Stop work on this job until Operations settles it. Money already released to you stays yours.",
  },
  refund_reviewed: {
    title: "Refund under review",
    body: "Operations is reviewing the client's request. The job stays paused until they settle it.",
  },
  refund_settled: {
    title: "Job settled",
    body: "Operations settled the refund. The parts of your payout not yet paid are replaced by the agreed settlement. Open the job to see what you keep.",
  },
  refund_rejected: {
    title: "Refund request closed",
    body: "The client's refund request was declined, and the pause is lifted. Open the job to pick it up where you left it.",
  },
  refund_withdrawn: {
    title: "Refund request withdrawn",
    body: "The client withdrew their refund request, and the pause is lifted. Open the job to pick it up where you left it.",
  },
  refund_paid: {
    title: "Refund complete",
    body: "Operations finished the client's refund. Nothing more is needed from your shop.",
  },
  refund_supplier_paid: {
    title: "Settlement payout sent",
    body: "Operations sent your agreed settlement payout for this job. The wallet transfer evidence is on the job.",
  },
};

/** The client's side of the transfer: nothing for the shop to do. */
const CLIENT_SIDE = new Set(["refund_destination", "refund_attempt", "refund_unknown", "refund_failed"]);
const CLIENT_SIDE_ALERT = {
  title: "Client refund update",
  body: "Operations is handling the client's side of the refund. Nothing changes for your shop.",
};

export function isRefundAlert(type: string | undefined): boolean {
  return Boolean(type?.startsWith("refund_"));
}

/** A refund notice in the shop's words, or null when the alert is not one. */
export function presentRefundAlert(
  alert: Pick<Notification, "type">,
): { title: string; body: string } | null {
  if (!isRefundAlert(alert.type)) return null;
  const type = alert.type as string;
  if (CLIENT_SIDE.has(type)) return CLIENT_SIDE_ALERT;
  return (
    REFUND_ALERTS[type] ?? {
      title: "Refund update",
      body: "Operations updated a refund on this job. Open it to see where it stands.",
    }
  );
}

/**
 * The settlement's timeline entry, which also tells the client whether their
 * transfer has been recorded. That half is not the shop's.
 */
export function presentRefundTimelineNote(note: string): string {
  return /^Refund settlement approved\b/.test(note) ? "Operations settled the refund on this job." : note;
}
