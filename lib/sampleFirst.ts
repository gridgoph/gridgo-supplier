import type { Notification, Order } from "@/lib/api";
import { parseMoney } from "@/lib/money";

/**
 * Sample First (gridgo-api `docs/SAMPLE_FIRST_API.md`), as far as it is the shop's.
 *
 * A client may pay for one piece of a listing before the full run. To the
 * shop that sample is an ordinary one-piece job at its sample price, tagged
 * `sample`; if the client approves it and orders the batch, the batch is an
 * ordinary job tagged `batch_from_sample`, carrying the sample's job id and
 * the client's decision — the standard the batch is held to.
 *
 * The client's held price list is never sent to the shop, so nothing here
 * speaks of it beyond saying that a price change does not reach a held batch.
 */

export type SampleTag = "sample" | "batch_from_sample";

export const SAMPLE_TAG_LABEL: Record<SampleTag, string> = {
  sample: "Sample",
  batch_from_sample: "Batch from sample",
};

/** The job's Sample First tag, or null on every other job (and on an older API). */
export function sampleTagOf(order: Pick<Order, "orderTags"> | null | undefined): SampleTag | null {
  const tags = Array.isArray(order?.orderTags) ? order.orderTags : [];
  if (tags.includes("batch_from_sample")) return "batch_from_sample";
  if (tags.includes("sample")) return "sample";
  return null;
}

/** The line under the chip on the job screen. */
export const SAMPLE_JOB_NOTE: Record<SampleTag, string> = {
  sample:
    "One piece at your sample price. The client checks it when it arrives, then decides on the full batch.",
  batch_from_sample: "The client approved a sample of this first. Make the batch to match it.",
};

export type SampleDecision =
  | {
      decision: "approved";
      at: string | null;
      /** The client's own photo of the sample it received, when it sent one. */
      samplePhotoFileId: string | null;
      note: string;
    }
  | {
      decision: "rejected";
      at: string | null;
      reason: string;
      next: "resample" | "cancel" | null;
    };

/**
 * The client's decision on the sample, or null before it decides.
 *
 * A later, signed approval arrives as another `method` on the same record;
 * an unknown method is still an approval, shown with its photo.
 */
export function sampleDecisionOf(order: Pick<Order, "sampleDecision"> | null | undefined): SampleDecision | null {
  const raw = order?.sampleDecision;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const at = typeof record.at === "string" ? record.at : null;
  if (record.decision === "approved") {
    return {
      decision: "approved",
      at,
      samplePhotoFileId: typeof record.samplePhotoFileId === "string" && record.samplePhotoFileId ? record.samplePhotoFileId : null,
      note: typeof record.note === "string" ? record.note.trim() : "",
    };
  }
  if (record.decision === "rejected") {
    return {
      decision: "rejected",
      at,
      reason: typeof record.reason === "string" ? record.reason.trim() : "",
      next: record.next === "resample" || record.next === "cancel" ? record.next : null,
    };
  }
  return null;
}

/** What the client will do after turning the sample down. */
export function rejectionNextLine(next: "resample" | "cancel" | null): string | null {
  if (next === "resample") return "The client may order another sample with changes.";
  if (next === "cancel") return "The client will not order the batch.";
  return null;
}

/** The other job in the pair, when GRIDGO links one. */
export function linkedSampleJob(order: Pick<Order, "orderTags" | "sampleOrderId" | "batchOrderId">):
  | { id: string; label: string }
  | null {
  const tag = sampleTagOf(order);
  if (tag === "batch_from_sample" && order.sampleOrderId) {
    return { id: order.sampleOrderId, label: "Open the sample job" };
  }
  if (tag === "sample" && order.batchOrderId) {
    return { id: order.batchOrderId, label: "Open the batch job" };
  }
  return null;
}

/** Whether a job has a decision or a linked job worth a panel. */
export function showsSampleDecision(
  order: Pick<Order, "orderTags" | "sampleDecision" | "sampleOrderId" | "batchOrderId">,
): boolean {
  return Boolean(sampleTagOf(order) && (sampleDecisionOf(order) || linkedSampleJob(order)));
}

// ---------------------------------------------------------------------------
// Alerts

export const SAMPLE_APPROVED_ALERT = "shop_sample_approved";
export const SAMPLE_REJECTED_ALERT = "shop_sample_rejected";

export function isSampleAlert(type: string | undefined): boolean {
  return type === SAMPLE_APPROVED_ALERT || type === SAMPLE_REJECTED_ALERT;
}

/** GRIDGO's words are a generic "Open GRIDGO"; these say what happened. */
export function presentSampleAlert(alert: Pick<Notification, "type">): { title: string; body: string } | null {
  if (alert.type === SAMPLE_APPROVED_ALERT) {
    return {
      title: "Sample approved",
      body: "The client approved your sample. If they order the batch, it comes to you to match it.",
    };
  }
  if (alert.type === SAMPLE_REJECTED_ALERT) {
    return {
      title: "Sample not approved",
      body: "The client turned down your sample. Open the job to read why.",
    };
  }
  return null;
}

/** The client's reason, under a "not approved" alert, once the job is on the phone. */
export function sampleAlertReason(
  alert: Pick<Notification, "type">,
  job: Pick<Order, "sampleDecision"> | null | undefined,
): string | null {
  if (alert.type !== SAMPLE_REJECTED_ALERT) return null;
  const decision = sampleDecisionOf(job);
  return decision?.decision === "rejected" && decision.reason ? decision.reason : null;
}

// ---------------------------------------------------------------------------
// The listing's offer

export const SAMPLE_SECTION_HINT =
  "Let a client pay for one piece before the full run. The sample is its own job, paid and delivered like any other.";
export const SAMPLE_SWITCH_LABEL = "Sample available";
export const SAMPLE_SWITCH_HINT = "Clients see “Order a sample first” beside the normal order button.";
export const SAMPLE_PRICE_LABEL = "Your price for one sample";
export const SAMPLE_LIVE_NOTE = "Goes live as soon as you save. Operations does not review it.";
export const SAMPLE_COLOUR_NOTE = "Listings priced by colour cannot offer a sample.";
export const SAMPLE_PRICE_NEEDED = "Set a price for one sample before offering it.";

/** What a client who approves a sample may still order at, in days. */
export function sampleHoldLine(days: number): string {
  return `A client who approves the sample keeps your prices from the day they ordered it, bulk prices included, for ${days} ${days === 1 ? "day" : "days"} after it arrives. Changing your prices does not change theirs.`;
}

/**
 * Why the offer cannot be saved yet: GRIDGO refuses an offer without a price
 * (`sample_price_required`), and a sample must cost something. Null when it can go.
 */
export function sampleOfferProblem(offer: { sampleAvailable: boolean | null; samplePrice: string }, colourPriced: boolean): string | null {
  if (!offer.sampleAvailable || colourPriced) return null;
  const money = parseMoney(offer.samplePrice);
  if (!money.ok) return money.error;
  if (money.minor == null || money.minor < 1) return SAMPLE_PRICE_NEEDED;
  return null;
}
