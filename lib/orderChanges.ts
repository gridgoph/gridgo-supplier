import type { Notification, Order, ProductionItem } from "@/lib/api";
import { formatPhp } from "@/lib/money";
import { orderProductionItems } from "@/lib/productionSpecs";
import { readColourQuote, type ColourQuote } from "@/lib/colourPricing";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Special instructions and change requests, as far as they are the shop's
 * business (gridgo-api `docs/ORDER_CHANGES_API.md`).
 *
 * A client may write up to 300 characters under each item. GRIDGO masks
 * contact details before it stores them, freezes them at checkout, and refuses
 * a shop's acceptance until the shop ticks that it read them
 * (`specialInstructionsRead: true`); the tick is recorded with the time, and a
 * replacement shop ticks again. A note never changes the price.
 *
 * When a note costs more, the shop asks for a change: what it will do
 * differently, the extra for its own shop, and why. Nothing changes until the
 * client approves, and a priced change waits for the client's payment and
 * GRIDGO's check of it — until then the job is made as ordered. One request
 * may be open at a time, and never beside an open deadline request.
 *
 * This is the only place that reads `specialInstructions*` and
 * `changeRequests`, and the only place a change request's status or an
 * `order_change_*` notice becomes words. GRIDGO's fee and the client's total
 * are withheld from this app; `extraPrincipalMinor` is the shop's own extra.
 */

/** GRIDGO's limits, so a refusal is said before anything is sent. */
export const PROPOSED_CHANGE_MAX = 300;
export const CHANGE_REASON_MAX = 2000;

export type ChangeStatus =
  | "pending"
  | "pending_payment"
  | "pending_confirmation"
  | "applied"
  | "declined"
  | "closed";

const STATUSES: readonly ChangeStatus[] = [
  "pending",
  "pending_payment",
  "pending_confirmation",
  "applied",
  "declined",
  "closed",
];

/** Still waiting on the client or on GRIDGO; while one is, no other may be asked. */
const OPEN = new Set<ChangeStatus>(["pending", "pending_payment", "pending_confirmation"]);

/** States a change may be asked in, before the job is first marked ready. */
const WINDOW_STATES = new Set([
  "supplier_assigned",
  "supplier_accepted",
  "payment_authorized",
  "production",
  "supplier_self_qc",
]);
const PAST_READY = new Set(["ready_for_dispatch", "rider_assigned", "picked_up", "delivered", "completed"]);

export type ChangePayout = { status: "pending" | "released" | "superseded"; amountMinor: number };

export type ChangeRequest = {
  id: string;
  lineItemId: string | null;
  status: ChangeStatus;
  version: number;
  reason: string;
  proposedSpec: string;
  proposedReadyBy: string | null;
  extraPrincipalMinor: number;
  createdAt: string;
  /** The client's note as it stood when the shop asked. */
  originalInstructions: string;
  payout: ChangePayout | null;
  /** The shop's corrected colour pages, when the change is a colour correction. */
  colourCorrection: ColourQuote | null;
};

export type ItemInstructions = {
  lineItemId: string;
  itemName: string;
  text: string;
  /** The latest change the client agreed to for this item, if any. */
  agreedChange: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** One request, from an order projection or a `{changeRequest}` body. Null when unreadable. */
export function normalizeChangeRequest(value: unknown): ChangeRequest | null {
  const raw = isRecord(value) && isRecord(value.changeRequest) ? value.changeRequest : value;
  if (!isRecord(raw)) return null;
  const status = STATUSES.find((s) => s === raw.status);
  const id = text(raw.id);
  if (!status || !id) return null;
  const payout = isRecord(raw.payout) ? raw.payout : null;
  const payoutStatus = payout ? (["pending", "released", "superseded"] as const).find((s) => s === payout.status) : undefined;
  return {
    id,
    lineItemId: text(raw.lineItemId) || null,
    status,
    version: typeof raw.version === "number" ? raw.version : 1,
    reason: text(raw.reason),
    proposedSpec: text(raw.proposedSpec),
    proposedReadyBy: text(raw.proposedReadyBy) || null,
    extraPrincipalMinor: amount(raw.extraPrincipalMinor),
    createdAt: text(raw.createdAt),
    originalInstructions: text(raw.originalInstructions),
    payout: payout && payoutStatus ? { status: payoutStatus, amountMinor: amount(payout.amountMinor) } : null,
    colourCorrection: readColourQuote(raw.colourCorrection),
  };
}

/** Every request on the job, oldest first, as GRIDGO keeps them. */
export function changeRequestsOf(order: Pick<Order, "changeRequests">): ChangeRequest[] {
  if (!Array.isArray(order.changeRequests)) return [];
  return order.changeRequests
    .map(normalizeChangeRequest)
    .filter((request): request is ChangeRequest => request !== null);
}

/** The request the job is about now: the open one, else the latest. */
export function currentChangeRequest(order: Pick<Order, "changeRequests">): ChangeRequest | null {
  const all = changeRequestsOf(order);
  return all.find((request) => OPEN.has(request.status)) ?? all.at(-1) ?? null;
}

export function isOpenChange(request: ChangeRequest): boolean {
  return OPEN.has(request.status);
}

type InstructionsOrder = Pick<
  Order,
  | "id"
  | "title"
  | "quantity"
  | "size"
  | "material"
  | "finish"
  | "productionItems"
  | "specialInstructions"
  | "specialInstructionLines"
>;

/** One item's own note and agreed change, as drawn under its specification. */
export function itemNote(item: Pick<ProductionItem, "specialInstructions" | "agreedChange">): {
  text: string;
  agreedChange: string | null;
} {
  return { text: text(item.specialInstructions), agreedChange: text(item.agreedChange?.proposedSpec) || null };
}

/**
 * Each item's note, in the docket's item order. A note GRIDGO sent only in
 * `specialInstructionLines` still counts, and an older order's single note
 * stands for the whole job.
 */
export function itemInstructions(order: InstructionsOrder): ItemInstructions[] {
  const items = orderProductionItems(order);
  const fromLines = new Map(
    (Array.isArray(order.specialInstructionLines) ? order.specialInstructionLines : [])
      .filter((line) => isRecord(line))
      .map((line) => [text(line.lineItemId), text(line.text)] as const),
  );
  const notes = items
    .map((item) => ({
      lineItemId: item.id,
      itemName: item.itemName,
      text: itemNote(item).text || fromLines.get(item.id) || "",
      agreedChange: itemNote(item).agreedChange,
    }))
    .filter((note) => note.text || note.agreedChange);
  const legacy = text(order.specialInstructions);
  if (!notes.length && legacy) {
    return [{ lineItemId: "", itemName: order.title, text: legacy, agreedChange: null }];
  }
  return notes;
}

/** True when the job carries any note the shop must read. */
export function hasSpecialInstructions(order: InstructionsOrder): boolean {
  return itemInstructions(order).some((note) => note.text);
}

/**
 * When this shop ticked that it read the notes, or null. A tick from another
 * shop — the one this job was taken from — is not this shop's.
 */
export function instructionsReadAt(
  order: Pick<Order, "supplierId" | "state" | "specialInstructionsAcknowledgement">,
): string | null {
  const ack = order.specialInstructionsAcknowledgement;
  if (!isRecord(ack) || order.state === "supplier_assigned") return null;
  if (ack.supplierId && order.supplierId && ack.supplierId !== order.supplierId) return null;
  return text(ack.at) || null;
}

/**
 * From the offer until the job is first marked ready: the stretch in which the
 * notes sit in front of the work and a change may still be asked for.
 */
export function changeWindowOpen(order: Pick<Order, "state" | "timeline">): boolean {
  if (!WINDOW_STATES.has(order.state)) return false;
  return !(order.timeline ?? []).some((entry) => PAST_READY.has(entry.state));
}

/** Whether "Request a change" belongs on this job right now. */
export function canRequestChange(
  order: Pick<
    Order,
    "state" | "timeline" | "changeRequests" | "rescheduleRequest" | "shopRecovery" | "refundHold" | "refundDisposition"
  >,
): boolean {
  if (!changeWindowOpen(order)) return false;
  if (changeRequestsOf(order).some(isOpenChange)) return false;
  if (order.rescheduleRequest?.status === "pending") return false;
  if (order.shopRecovery && order.shopRecovery.status !== "accepted") return false;
  return !order.refundHold && !order.refundDisposition;
}

/** True while a change request is waiting, which keeps a deadline request off the job. */
export function hasOpenChange(order: Pick<Order, "changeRequests">): boolean {
  return changeRequestsOf(order).some(isOpenChange);
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export function proposedChangeError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Say what you will do differently.";
  if ([...trimmed].length > PROPOSED_CHANGE_MAX) return `Keep the change under ${PROPOSED_CHANGE_MAX} characters.`;
  return null;
}

export function changeReasonError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Tell the client why the job needs this change.";
  if ([...trimmed].length > CHANGE_REASON_MAX) return "Keep the reason under 2,000 characters.";
  return null;
}

// ---------------------------------------------------------------------------
// Where a request stands
// ---------------------------------------------------------------------------

export type ChangeNotice = {
  chip: { label: string; tone: StatusTone; icon: StatusIconName };
  title: string;
  body: string;
  /** What the extra means for the shop's money, when there is one. */
  money: string | null;
};

function extraLine(request: ChangeRequest): string | null {
  if (!request.extraPrincipalMinor) return null;
  const extra = formatPhp(request.extraPrincipalMinor);
  switch (request.status) {
    case "pending":
    case "pending_payment":
    case "pending_confirmation":
      return `${extra} extra for your shop if the client pays for the change.`;
    case "applied":
      if (request.payout?.status === "released") return `${extra} extra was released with your last payout part.`;
      if (request.payout?.status === "superseded") return `${extra} extra was replaced by the refund settlement.`;
      return `${extra} extra for your shop, paid with your last payout part.`;
    default:
      return `${extra} extra was not agreed. Nothing changes in what you are paid.`;
  }
}

/** Where a request stands, in the shop's words. */
export function changeNotice(request: ChangeRequest): ChangeNotice {
  const money = extraLine(request);
  switch (request.status) {
    case "pending":
      return {
        chip: { label: "Waiting for the client", tone: "info", icon: "clock" },
        title: "You asked for a change",
        body: "The client approves or declines it. Until they approve, make the job as ordered.",
        money,
      };
    case "pending_payment":
      return {
        chip: { label: "Approved, waiting for payment", tone: "info", icon: "banknote" },
        title: "The client approved the change",
        body: "They still have to pay for it. Keep making the job as ordered until GRIDGO confirms their payment.",
        money,
      };
    case "pending_confirmation":
      return {
        chip: { label: "Payment being checked", tone: "info", icon: "clock" },
        title: "The client paid for the change",
        body: "GRIDGO is checking the payment. Keep making the job as ordered until it is confirmed.",
        money,
      };
    case "applied":
      return {
        chip: { label: "Approved", tone: "success", icon: "circle-check" },
        title: "The change is agreed",
        body: "Make the job with this change. It is now part of what you agreed to make.",
        money,
      };
    case "declined":
      return {
        chip: { label: "Declined", tone: "warning", icon: "circle-x" },
        title: "The client declined the change",
        body: "Keep making the job as ordered. If you cannot, report a problem with this job.",
        money,
      };
    case "closed":
      return {
        chip: { label: "Closed", tone: "neutral", icon: "circle-x" },
        title: "This request closed without a change",
        body: "The job moved on before it was settled. Make it as ordered.",
        money,
      };
  }
}

/** One short word for a request in the job's history. */
export function changeStatusLabel(request: ChangeRequest): string {
  return changeNotice(request).chip.label;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

const ALERTS: Record<string, { title: string; body: string }> = {
  order_change_requested: {
    title: "Change request sent",
    body: "The client approves or declines it. Until they approve, make the job as ordered.",
  },
  order_change_accepted: {
    title: "Change approved, waiting for payment",
    body: "The client approved your change. Keep making the job as ordered until GRIDGO confirms their payment.",
  },
  order_change_payment_submitted: {
    title: "Payment for the change sent",
    body: "GRIDGO is checking the client's payment. Keep making the job as ordered until it is confirmed.",
  },
  order_change_payment_rejected: {
    title: "Payment for the change not confirmed",
    body: "GRIDGO could not confirm the client's payment yet. Keep making the job as ordered.",
  },
  order_change_applied: {
    title: "Change agreed",
    body: "Make the job with the change. Open the job to see it.",
  },
  order_change_declined: {
    title: "Change declined",
    body: "The client declined your change. Make the job as ordered.",
  },
  order_change_closed: {
    title: "Change request closed",
    body: "The job moved on before your change was settled. Make it as ordered.",
  },
};

/**
 * A change-request notice in the shop's words, or null when the alert is not
 * one. GRIDGO sends the same generic words to every party.
 */
export function presentChangeAlert(alert: Pick<Notification, "type">): { title: string; body: string } | null {
  const type = alert.type ?? "";
  if (!type.startsWith("order_change_")) return null;
  return (
    ALERTS[type] ?? {
      title: "Change request update",
      body: "Something changed on your change request. Open the job to see where it stands.",
    }
  );
}
