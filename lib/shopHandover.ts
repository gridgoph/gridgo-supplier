import type { Order } from "@/lib/api";

/**
 * The shop-to-rider handover a job runs on (gridgo-api
 * `docs/SHOP_HANDOVER_API.md`, report 6C695C15). This module is the only place
 * that reads `handoverFlow`, `shopHandover` and `forcedSteps`.
 *
 * Packing moved. On the newer handover (`rider_packs`) the shop no longer packs
 * before a rider is called:
 *
 * 1. The shop photographs the finished, **unpacked** products and sends them
 *    for GRIDGO's review. Its production time stops while GRIDGO reviews.
 * 2. Once GRIDGO approves, the shop marks the job ready for rider pickup and
 *    prepares packing materials — it does **not** pack.
 * 3. The rider checks the unpacked products at the counter, the shop packs in
 *    front of the rider, the rider photographs the packed job, and the shop
 *    signs on the rider's phone. Custody moves only at that signature.
 *
 * Every older job keeps the legacy handover (packing photo, then Ready for
 * dispatch, then one check at the counter), and GRIDGO says which on the job.
 * Nothing here guesses it from dates or payout plans: a job without the field
 * is legacy, because an older GRIDGO has no other.
 *
 * GRIDGO can force a step past a missing check. That is staff's, never the
 * shop's, and always carries a reason; the shop reads it as "Forced by GRIDGO".
 */

export type HandoverFlow = "rider_packs" | "legacy";

type FlowOrder = Pick<Order, "handoverFlow">;

export function handoverFlowOf(order: FlowOrder | null | undefined): HandoverFlow {
  return order?.handoverFlow === "rider_packs" ? "rider_packs" : "legacy";
}

/** True when the rider checks the unpacked products and the shop packs in front of them. */
export function ridersPack(order: FlowOrder | null | undefined): boolean {
  return handoverFlowOf(order) === "rider_packs";
}

/** The words the shop is told wherever a rider is called on the newer handover. */
export const DO_NOT_PACK_YET =
  "Prepare packing materials. Do not pack yet; the rider checks the unpacked items first.";

// ---------------------------------------------------------------------------
// Reading the record
// ---------------------------------------------------------------------------

type Submission = { at: string | null; supplierId: string | null; photoCount: number };
type ReviewRecord = { at: string | null; decision: "approved" | "rejected" | null; note: string | null };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function submission(value: unknown): Submission | null {
  const raw = record(value);
  if (!raw) return null;
  return {
    at: text(raw.at),
    supplierId: text(raw.supplierId),
    photoCount: Array.isArray(raw.photoFileIds) ? raw.photoFileIds.length : 0,
  };
}

function review(value: unknown): ReviewRecord | null {
  const raw = record(value);
  if (!raw) return null;
  const decision = raw.decision === "approved" || raw.decision === "rejected" ? raw.decision : null;
  return { at: text(raw.at), decision, note: text(raw.note) };
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((row): row is Record<string, unknown> => row !== null) : [];
}

type HandoverOrder = Pick<Order, "state" | "handoverFlow" | "shopHandover"> & Partial<Pick<Order, "supplierId">>;

/** A submission is this shop's only when it names this shop: a replacement never inherits one. */
function ownSubmission(order: HandoverOrder, value: Submission | null): Submission | null {
  if (!value) return null;
  if (value.supplierId && order.supplierId && value.supplierId !== order.supplierId) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Finished products and GRIDGO's review
// ---------------------------------------------------------------------------

/**
 * Where the finished products stand with GRIDGO, on the newer handover, while
 * the job is still the shop's to finish.
 *
 * - `not_sent` — photograph the finished, unpacked products and send them.
 *   `correction` carries GRIDGO's note when it asked for a fix last time:
 *   the photos it saw cannot be sent again, so new ones are needed.
 * - `in_review` — GRIDGO is checking them. The shop's production time is
 *   paused, and nothing is packed.
 * - `approved` — the shop can mark the job ready for rider pickup.
 * - `with_gridgo` — GRIDGO moved the job on itself, with nothing of the
 *   shop's to review; Operations takes the next step.
 */
export type FinishedStage =
  | { stage: "not_sent"; correction: { note: string | null; at: string | null } | null }
  | { stage: "in_review"; sentAt: string | null; photoCount: number }
  | { stage: "approved"; sentAt: string | null; reviewedAt: string | null }
  | { stage: "with_gridgo" };

export function finishedStage(order: HandoverOrder): FinishedStage | null {
  if (!ridersPack(order)) return null;
  if (order.state !== "production" && order.state !== "supplier_self_qc") return null;
  const handover = record(order.shopHandover);
  const sent = ownSubmission(order, submission(handover?.finished));
  const answer = review(handover?.review);

  if (order.state === "production") {
    const last = list(handover?.attempts).at(-1);
    const lastReview = review(last?.review);
    const lastSent = ownSubmission(order, submission(last?.finished));
    const correction =
      lastSent && lastReview?.decision === "rejected" ? { note: lastReview.note, at: lastReview.at } : null;
    return { stage: "not_sent", correction };
  }
  if (!sent) return { stage: "with_gridgo" };
  if (answer?.decision === "approved") return { stage: "approved", sentAt: sent.at, reviewedAt: answer.at };
  if (!answer) return { stage: "in_review", sentAt: sent.at, photoCount: sent.photoCount };
  return { stage: "with_gridgo" };
}

/**
 * When the shop's production time stopped, as GRIDGO counts it on the newer
 * handover: the moment the finished photos went for review. `pending` while
 * GRIDGO has not answered — the clock is paused, not finished — and false
 * once it approved them, when that moment is the shop's finish.
 */
export function shopFinish(order: HandoverOrder & Pick<Order, "readyAt">): { at: string; pending: boolean } | null {
  if (!ridersPack(order)) return null;
  const handover = record(order.shopHandover);
  const sent = ownSubmission(order, submission(handover?.finished));
  if (!sent?.at) return null;
  const answer = review(handover?.review);
  if (answer?.decision === "rejected") return null;
  return { at: sent.at, pending: !answer && !order.readyAt && order.state === "supplier_self_qc" };
}

/**
 * Time GRIDGO spent on reviews it sent back, which it leaves out of the shop's
 * production time. Wall-clock here; GRIDGO measures it in the order's opening
 * hours, so this is a reading aid and GRIDGO's own figures stay the record.
 */
export function rejectedReviewMs(order: HandoverOrder, until: number): number {
  if (!ridersPack(order)) return 0;
  let total = 0;
  for (const attempt of list(record(order.shopHandover)?.attempts)) {
    const sent = ownSubmission(order, submission(attempt.finished));
    const answer = review(attempt.review);
    if (!sent?.at || answer?.decision !== "rejected" || !answer.at) continue;
    const start = Date.parse(sent.at);
    const end = Math.min(Date.parse(answer.at), until);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) total += end - start;
  }
  return total;
}

// ---------------------------------------------------------------------------
// At the counter
// ---------------------------------------------------------------------------

/**
 * What happens at the counter on the newer handover, in order. A sequence, so
 * it is numbered wherever it is drawn.
 */
export type CounterStep = "check" | "pack" | "sign";

export const COUNTER_SEQUENCE: { id: CounterStep; title: string; detail: string }[] = [
  {
    id: "check",
    title: "The rider checks the unpacked products",
    detail:
      "Keep everything unpacked. The rider counts every piece and checks it against the spec, for visible defects and the paperwork, and looks over your packing materials.",
  },
  {
    id: "pack",
    title: "You pack it in front of the rider",
    detail: "Once every check passes, pack the job at the counter. The rider photographs the packed job.",
  },
  {
    id: "sign",
    title: "You sign on the rider's phone",
    detail: "Your signature hands the job over. Until you sign, it stays with your shop.",
  },
];

export type RiderPacking = {
  /** The step the counter is on now. */
  step: CounterStep;
  /** The rider recorded the job as already packed when they arrived; unpack it for the check. */
  arrivedPacked: boolean;
  checkedAt: string | null;
  packedAt: string | null;
};

type CounterOrder = HandoverOrder & Partial<Pick<Order, "riderId" | "pickupChecklist">>;

/**
 * Where the counter stands while a rider is assigned on the newer handover,
 * or null for anything else. A failed check is not here: it keeps the job
 * with the shop and is the counter check's own panel (`lib/pickupCheck.ts`).
 */
export function riderPacking(order: CounterOrder): RiderPacking | null {
  if (!ridersPack(order) || order.state !== "rider_assigned") return null;
  const checklist = order.pickupChecklist;
  if (checklist?.status === "failed_escalated" || checklist?.status === "escalation_resolved") return null;
  const handover = record(order.shopHandover);
  const inspection =
    checklist?.status === "inspected" && checklist.inspectionId ? checklist.inspectionId : null;
  const packed = inspection
    ? list(handover?.packingPhotos).filter((row) => row.inspectionId === inspection)
    : [];
  const step: CounterStep = !inspection ? "check" : packed.length ? "sign" : "pack";
  const arrivedPacked =
    step === "check" &&
    list(handover?.arrivedPacked).some((row) => !order.riderId || row.riderId === order.riderId);
  return {
    step,
    arrivedPacked,
    checkedAt: inspection ? (checklist?.completedAt ?? null) : null,
    packedAt: text(packed.at(-1)?.at),
  };
}

// ---------------------------------------------------------------------------
// Forced by GRIDGO
// ---------------------------------------------------------------------------

const FORCED_REASONS: Record<string, string> = {
  technical_issue: "Technical issue",
  evidence_verified_offline: "Checked in person",
  operational_correction: "Operations correction",
  other: "Other reason",
};

const SKIPPED_CHECKS: Record<string, string> = {
  production_finished_required: "Finished-product photos",
  finished_product_photo_required: "Finished-product photos",
  production_review_required: "GRIDGO's review",
  production_photo_required: "Production photo",
  packing_photo_required: "Packing photo",
};

export type ForcedStepView = {
  key: string;
  at: string | null;
  /** The reason GRIDGO chose, in words. */
  reason: string;
  /** GRIDGO's own note, as written. */
  note: string | null;
  /** The checks that were missing when it forced the step, in words. */
  skipped: string[];
  /** Whether the step skipped from finished production straight to rider pickup. */
  toPickup: boolean;
};

type ForcedOrder = Pick<Order, "forcedSteps" | "forcedByGridgo">;

/** The steps GRIDGO forced on this job, oldest first. */
export function forcedSteps(order: ForcedOrder): ForcedStepView[] {
  return list(order.forcedSteps).map((row, index) => {
    const skipped = Array.isArray(row.skippedChecks)
      ? [
          ...new Set(
            row.skippedChecks
              .filter((code): code is string => typeof code === "string")
              .map((code) => SKIPPED_CHECKS[code] ?? "Another check"),
          ),
        ]
      : [];
    return {
      key: `${text(row.at) ?? "forced"}:${index}`,
      at: text(row.at),
      reason: FORCED_REASONS[String(row.reasonCode)] ?? "Reason given",
      note: text(row.note),
      skipped,
      toPickup: row.to === "ready_for_dispatch",
    };
  });
}

/** The tag every app draws on a job GRIDGO forced a step on. */
export function isForcedByGridgo(order: ForcedOrder): boolean {
  return order.forcedByGridgo === true || list(order.forcedSteps).length > 0;
}

export const FORCED_TAG = "Forced by GRIDGO";
