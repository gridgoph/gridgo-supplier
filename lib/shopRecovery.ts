import type { Notification, Order, ShopFailureKind } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * A job this shop let go, as far as it is the shop's business (gridgo-api
 * `docs/SHOP_RECOVERY_API.md`).
 *
 * Three ways a job leaves a shop: the hour to answer runs out, the shop
 * declines it, or the shop cancels one it already accepted. Each one goes on
 * the shop's record with the stage the job had reached, and GRIDGO offers the
 * client another vetted shop or a full refund. Until the client chooses, the
 * job stays on this shop's list with its old state — so the state alone would
 * still say "In production" and offer the next step. This module is what says
 * otherwise. Three rules shape it:
 *
 * - **The work stops.** GRIDGO holds the job while the client chooses, so no
 *   step is offered and the copy says to leave it.
 * - **The client's choice is not the shop's to watch.** The shop sees only
 *   whether the client is choosing, Operations is reviewing, or a refund was
 *   chosen. Replacement shops, dates and money stay off this app.
 * - **No cancellation fine.** The platform records the stage; it takes no
 *   money for it. What a cancelled shop does lose is any part of its earnings
 *   not yet released, which is said before it cancels.
 */

export type ShopRelease = {
  kind: ShopFailureKind;
  chip: { label: string; tone: StatusTone; icon: StatusIconName };
  title: string;
  body: string;
};

const KINDS: readonly ShopFailureKind[] = ["timed_out", "declined", "cancelled"];

/** States from which an accepted job can still be given back (before the rider collects it). */
export const CANCELLABLE_STATES = new Set([
  "awaiting_checkout",
  "awaiting_initial_payment",
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
]);

function kindOf(order: Pick<Order, "state" | "shopAcceptance">): ShopFailureKind {
  const status = order.shopAcceptance?.status;
  const known = KINDS.find((kind) => kind === status);
  if (known) return known;
  return order.state === "supplier_assigned" ? "declined" : "cancelled";
}

const CHIPS: Record<ShopFailureKind, string> = {
  timed_out: "Not answered in time",
  declined: "Passed on",
  cancelled: "Cancelled by you",
};

const TITLES: Record<ShopFailureKind, string> = {
  timed_out: "The hour to answer ran out",
  declined: "You passed on this job",
  cancelled: "You cancelled this job",
};

/**
 * Where a job this shop let go stands, or null while the job is still the
 * shop's. A recovery the client already accepted belongs to the replacement
 * shop, which sees it on a job that is now its own.
 */
export function shopRelease(
  order: Pick<Order, "state" | "shopAcceptance" | "shopRecovery">,
): ShopRelease | null {
  const recovery = order.shopRecovery;
  if (!recovery || recovery.status === "accepted") return null;
  const kind = kindOf(order);
  const body =
    recovery.status === "refund_requested" || recovery.status === "refunded"
      ? "The client chose a full refund. Nothing more is needed from your shop."
      : recovery.status === "ops_review"
        ? "Operations is working out the next step with the client. Leave the job as it is; they will message you if they need your shop."
        : "GRIDGO has offered the client another vetted shop or a full refund. Leave the job as it is — nothing more is needed from your shop.";
  return {
    kind,
    chip: { label: CHIPS[kind], tone: "neutral", icon: "circle-x" },
    title: TITLES[kind],
    body,
  };
}

/** Whether the shop can give this accepted job back from here. */
export function canCancelJob(
  order: Pick<Order, "state" | "shopRecovery" | "refundHold" | "refundDisposition" | "rescheduleRequest">,
): boolean {
  if (!CANCELLABLE_STATES.has(order.state)) return false;
  if (order.shopRecovery && order.shopRecovery.status !== "accepted") return false;
  if (order.refundHold || order.refundDisposition) return false;
  // A declined deadline request is already finding the client another shop.
  return !order.rescheduleRequest?.workHeld;
}

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

export type CancelReasonId =
  | "machine_down"
  | "materials_out"
  | "overbooked"
  | "artwork_unprintable"
  | "shop_closing"
  | "other";

export type CancelReason = { id: CancelReasonId; label: string };

export const CANCEL_REASONS: readonly CancelReason[] = [
  { id: "machine_down", label: "A machine broke down" },
  { id: "materials_out", label: "Materials or stock ran out" },
  { id: "overbooked", label: "We took on more than we can finish" },
  { id: "artwork_unprintable", label: "The artwork cannot be printed as supplied" },
  { id: "shop_closing", label: "The shop has to close" },
  { id: "other", label: "Something else" },
] as const;

/** "Something else" says nothing on its own, so it needs the shop's words. */
export function cancelNeedsDetail(id: CancelReasonId | null): boolean {
  return id === "other";
}

/** The reason GRIDGO records, in the shop's own words after the choice. */
export function cancelReasonText(id: CancelReasonId, detail: string): string {
  const reason = CANCEL_REASONS.find((r) => r.id === id);
  const trimmed = detail.trim();
  if (id === "other") return trimmed;
  const base = reason?.label ?? "Cancelled by the shop";
  return trimmed ? `${base}. ${trimmed}` : base;
}

// ---------------------------------------------------------------------------
// The shop's record
// ---------------------------------------------------------------------------

export type ShopFailure = {
  id: string;
  orderId: string;
  kind: ShopFailureKind;
  /** The order state when it happened. */
  stage: string;
  reason: string;
  at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** `GET /me/shop-failures`, newest first, or null when the body is not that shape. */
export function normalizeShopFailures(body: unknown): ShopFailure[] | null {
  const rows = isRecord(body) && Array.isArray(body.events) ? body.events : null;
  if (!rows) return null;
  const out: ShopFailure[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const kind = KINDS.find((k) => k === row.kind);
    const id = text(row.id);
    const orderId = text(row.orderId);
    const at = text(row.at);
    if (!kind || !id || !orderId || Number.isNaN(Date.parse(at))) continue;
    out.push({ id, orderId, kind, stage: text(row.stage), reason: text(row.reason), at });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Where the job was when it left, in the shop's words. */
export function failureStageLabel(stage: string): string {
  switch (stage) {
    case "supplier_assigned":
      return "Before accepting";
    case "awaiting_checkout":
    case "awaiting_initial_payment":
    case "payment_authorized":
      return "Accepted, before production";
    case "production":
      return "During production";
    case "supplier_self_qc":
      return "While packing";
    case "ready_for_dispatch":
      return "Packed, waiting for a rider";
    case "rider_assigned":
      return "Rider on the way";
    default:
      return "Before pickup";
  }
}

export const FAILURE_LABELS: Record<ShopFailureKind, string> = {
  timed_out: "Not answered in time",
  declined: "Passed on",
  cancelled: "Cancelled",
};

/**
 * The reason worth repeating on the record. GRIDGO writes its own for a
 * timed-out job; the shop's own words are only on the other two.
 */
export function failureReason(failure: ShopFailure): string | null {
  return failure.kind === "timed_out" || !failure.reason ? null : failure.reason;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export const SHOP_RECOVERY_ALERT = "shop_recovery";

/**
 * A recovery notice in the shop's words, or null when the alert is not one.
 * GRIDGO writes one body for the client, the shop and Operations, and the
 * client's version ("the original shop could not fulfil your order") would
 * otherwise reach the shop that let it go.
 */
export function presentShopRecoveryAlert(
  alert: Pick<Notification, "type" | "body">,
): { title: string; body: string } | null {
  if (alert.type !== SHOP_RECOVERY_ALERT) return null;
  const body = alert.body ?? "";
  if (/accepted a replacement/i.test(body)) {
    return {
      title: "Replacement shop confirmed",
      body: "The client accepted a replacement shop for this job. If it has just reached your floor, answer it within the hour.",
    };
  }
  if (/full refund\. Operations/i.test(body)) {
    return {
      title: "Client chose a refund",
      body: "The client chose a full refund on a job your shop let go. Nothing more is needed from you.",
    };
  }
  if (/Operations is reviewing/i.test(body)) {
    return {
      title: "Job with Operations",
      body: "Operations is working out the next step on a job your shop let go. They will message you if they need anything.",
    };
  }
  return {
    title: "Job back with GRIDGO",
    body: "GRIDGO is offering the client another shop or a full refund. It is on your shop's record; nothing more is needed from you.",
  };
}
