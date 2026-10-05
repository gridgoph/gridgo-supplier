import type { Notification, Order, RescheduleRequest, RescheduleResolution, RescheduleStatus } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Asking the client for a later ready-by time (gridgo-api
 * `docs/ORDER_RESCHEDULE_API.md`).
 *
 * A shop may ask **once per job**, while the job is in production and before
 * it is marked ready. Nothing moves until the client says yes: the current
 * ready-by stands, and late production is still measured against it. The
 * client has 24 hours. Accepting moves the ready-by; declining stops the work
 * while GRIDGO offers the client another shop or a refund; silence keeps the
 * original date and tells Operations. Every request stays on the shop's
 * record whatever the answer, which is what stops a request being used to
 * dodge lateness.
 *
 * This is the only place that reads `rescheduleRequest` and the only place
 * its statuses become words.
 */

const STATUSES: readonly RescheduleStatus[] = ["pending", "accepted", "declined", "expired", "operations_required"];
const RESOLUTIONS: readonly RescheduleResolution[] = [
  "rematch_offered",
  "no_match",
  "operations_required",
  "rematched",
  "refund_requested",
  "resolved",
];

const ACTIVE_STATES = new Set(["production", "supplier_self_qc"]);

/** At most this many characters reach GRIDGO. */
export const RESCHEDULE_REASON_MAX = 2000;

/** Whether "Request a new deadline" belongs on this job right now. */
export function canRequestNewDeadline(
  order: Pick<
    Order,
    "state" | "readyAt" | "readyBy" | "rescheduleRequest" | "shopRecovery" | "refundHold" | "refundDisposition"
  >,
): boolean {
  if (!ACTIVE_STATES.has(order.state) || order.readyAt) return false;
  // One request per job, ever — whatever became of it.
  if (order.rescheduleRequest) return false;
  if (order.shopRecovery && order.shopRecovery.status !== "accepted") return false;
  if (order.refundHold || order.refundDisposition) return false;
  return Boolean(order.readyBy);
}

/**
 * Why a proposed ready-by cannot be sent, or null when it can. GRIDGO wants a
 * time in the future and later than the one the job already has.
 */
export function proposedDeadlineError(
  proposed: Date | null,
  currentReadyBy: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!proposed) return "Choose the new date and time.";
  if (proposed.getTime() <= now.getTime()) return "Choose a time that has not passed yet.";
  const current = currentReadyBy ? Date.parse(currentReadyBy) : Number.NaN;
  if (!Number.isNaN(current) && proposed.getTime() <= current) {
    return `Choose a time after your current ready-by, ${formatDeadlineFull(currentReadyBy)}.`;
  }
  return null;
}

export function reasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Tell the client why the job needs more time.";
  if (trimmed.length > RESCHEDULE_REASON_MAX) return "Keep the reason under 2,000 characters.";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** One request, from an order projection or a `{request}` body. Null when absent or unreadable. */
export function normalizeRescheduleRequest(value: unknown): RescheduleRequest | null {
  const raw = isRecord(value) && isRecord(value.request) ? value.request : value;
  if (!isRecord(raw)) return null;
  const status = STATUSES.find((s) => s === raw.status);
  const id = text(raw.id);
  if (!status || !id) return null;
  return {
    id,
    orderId: text(raw.orderId),
    reason: text(raw.reason),
    status,
    requestedAt: text(raw.requestedAt),
    expiresAt: text(raw.expiresAt),
    answeredAt: text(raw.answeredAt) || null,
    resolution: RESOLUTIONS.find((r) => r === raw.resolution) ?? null,
    workHeld: raw.workHeld === true,
    originalReadyBy: text(raw.originalReadyBy),
    proposedReadyBy: text(raw.proposedReadyBy),
  };
}

/** `GET /me/reschedule-requests`, or null when the body is not that shape. */
export function normalizeRescheduleRequests(
  body: unknown,
): { total: number; requests: RescheduleRequest[] } | null {
  if (!isRecord(body) || !Array.isArray(body.requests)) return null;
  const requests = body.requests
    .map(normalizeRescheduleRequest)
    .filter((request): request is RescheduleRequest => request !== null);
  const total = typeof body.totalRequests === "number" ? body.totalRequests : requests.length;
  return { total, requests };
}

export type RescheduleNotice = {
  chip: { label: string; tone: StatusTone; icon: StatusIconName };
  title: string;
  body: string;
  /** The date the shop is held to now. */
  holdsTo: string;
  /** True while the client's answer has stopped the job. */
  stopped: boolean;
};

/** Where a request stands, in the shop's words. */
export function rescheduleNotice(request: RescheduleRequest): RescheduleNotice {
  const original = formatDeadlineFull(request.originalReadyBy);
  const proposed = formatDeadlineFull(request.proposedReadyBy);
  switch (request.status) {
    case "pending":
      return {
        chip: { label: "Waiting for the client", tone: "info", icon: "clock" },
        title: `You asked for ${proposed}`,
        body: `The client has until ${formatDeadlineFull(request.expiresAt)} to answer. Until then your ready-by stays ${original} — keep working to it.`,
        holdsTo: request.originalReadyBy,
        stopped: false,
      };
    case "accepted":
      return {
        chip: { label: "Accepted", tone: "success", icon: "circle-check" },
        title: "The client agreed to the new deadline",
        body: `Your ready-by is now ${proposed}. Late production is measured against it.`,
        holdsTo: request.proposedReadyBy,
        stopped: false,
      };
    case "expired":
      return {
        chip: { label: "Not answered", tone: "neutral", icon: "clock" },
        title: "The client did not answer in time",
        body: `Your ready-by stays ${original}. Operations has been told and will follow up with you.`,
        holdsTo: request.originalReadyBy,
        stopped: false,
      };
    case "operations_required":
      return {
        chip: { label: "With Operations", tone: "info", icon: "clock" },
        title: "Operations is deciding this one",
        body: request.workHeld
          ? "A late-production deduction already applies to this job, so Operations decides what happens next. Pause work until they contact you."
          : "A late-production deduction already applies to this job, so Operations decides what happens next. Your dates stay as they are until then.",
        holdsTo: request.originalReadyBy,
        stopped: request.workHeld,
      };
    case "declined":
      return declinedNotice(request, original);
  }
}

function declinedNotice(request: RescheduleRequest, original: string): RescheduleNotice {
  const chip = { label: "Declined", tone: "warning" as const, icon: "circle-x" as const };
  switch (request.resolution) {
    case "resolved":
      return {
        chip: { label: "Resolved", tone: "neutral", icon: "circle-check" },
        title: "Continue under your original deadline",
        body: `Operations agreed with the client that the job carries on. Your ready-by stays ${original}.`,
        holdsTo: request.originalReadyBy,
        stopped: false,
      };
    case "refund_requested":
      return {
        chip,
        title: "The client chose a refund",
        body: "The client declined the new deadline and asked for a full refund. Stop work on this job; nothing more is needed from you.",
        holdsTo: request.originalReadyBy,
        stopped: true,
      };
    case "rematched":
      return {
        chip,
        title: "The job moved to another shop",
        body: "The client declined the new deadline and accepted another shop. Nothing more is needed from you.",
        holdsTo: request.originalReadyBy,
        stopped: true,
      };
    case "operations_required":
      return {
        chip,
        title: "The client declined the new deadline",
        body: "Part of this job's money already reached you, so Operations decides what happens next. Pause work until they contact you.",
        holdsTo: request.originalReadyBy,
        stopped: true,
      };
    default:
      return {
        chip,
        title: "The client declined the new deadline",
        body: "Pause work on this job. GRIDGO is offering the client another shop or a full refund, and Operations will tell you what happens next.",
        holdsTo: request.originalReadyBy,
        stopped: true,
      };
  }
}

/** One short word for the shop's record. */
export function rescheduleRecordLabel(request: RescheduleRequest): string {
  return rescheduleNotice(request).chip.label;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

const ALERTS: Record<string, { title: string; body: string }> = {
  order_reschedule_requested: {
    title: "Deadline request sent",
    body: "The client has 24 hours to answer. Keep working to your current ready-by until they do.",
  },
  order_reschedule_accepted: {
    title: "New deadline accepted",
    body: "The client agreed to your new ready-by. Open the job to see it.",
  },
  order_reschedule_declined: {
    title: "New deadline declined",
    body: "The client declined. Pause work on this job while GRIDGO sorts out the next step with them.",
  },
  order_reschedule_expired: {
    title: "Deadline request not answered",
    body: "The client did not answer in 24 hours. Your original ready-by still applies, and Operations will follow up.",
  },
  order_reschedule_operations_required: {
    title: "Deadline request with Operations",
    body: "Operations is deciding what happens next on this job. Your dates stay as they are until they contact you.",
  },
  order_reschedule_rematched: {
    title: "Job moved to another shop",
    body: "The client accepted another shop after declining the new deadline. If the job has just reached your floor, answer it within the hour.",
  },
  order_reschedule_refund_requested: {
    title: "Client chose a refund",
    body: "The client asked for a full refund after declining the new deadline. Nothing more is needed from your shop.",
  },
  order_reschedule_resolved: {
    title: "Deadline request resolved",
    body: "Operations recorded how the job carries on. Open it to see where it stands.",
  },
};

/**
 * A deadline-request notice in the shop's words, or null when the alert is not
 * one. GRIDGO's own copy is written for every recipient at once.
 */
export function presentRescheduleAlert(
  alert: Pick<Notification, "type">,
): { title: string; body: string } | null {
  const type = alert.type ?? "";
  if (!type.startsWith("order_reschedule_")) return null;
  return (
    ALERTS[type] ?? {
      title: "Deadline request update",
      body: "Something changed on your deadline request. Open the job to see where it stands.",
    }
  );
}
