/**
 * Declining is irreversible for this shop: the job goes back to GRIDGO for
 * rematching and is not offered again. Operations needs to know why, so the
 * reason is a fixed, structured choice — never a free-text box the shop can
 * leave empty.
 */

export type DeclineReasonId =
  | "capacity_full"
  | "outside_capability"
  | "deadline_unachievable"
  | "spec_not_printable"
  | "price_too_low"
  | "shop_closed";

export type DeclineReason = {
  id: DeclineReasonId;
  /** What the shop taps. */
  label: string;
  /** What Operations and the client read on the timeline. */
  timelineNote: string;
};

export const DECLINE_REASONS: readonly DeclineReason[] = [
  {
    id: "capacity_full",
    label: "Capacity is full for this date",
    timelineNote: "Declined — shop capacity is full for the requested date",
  },
  {
    id: "outside_capability",
    label: "Material or size is outside what we print",
    timelineNote: "Declined — material or size is outside this shop's capability",
  },
  {
    id: "deadline_unachievable",
    label: "We cannot finish by the deadline",
    timelineNote: "Declined — deadline cannot be met",
  },
  {
    id: "spec_not_printable",
    label: "Artwork or spec is not printable as supplied",
    timelineNote: "Declined — artwork or spec is not printable as supplied",
  },
  {
    id: "price_too_low",
    label: "Price does not cover this job",
    timelineNote: "Declined — quoted price does not cover this job",
  },
  {
    id: "shop_closed",
    label: "Shop is closed on that date",
    timelineNote: "Declined — shop is closed on the requested date",
  },
] as const;

export function findDeclineReason(id: string | null): DeclineReason | null {
  return DECLINE_REASONS.find((r) => r.id === id) ?? null;
}

/**
 * The note that reaches the client's order timeline. The optional detail is
 * genuinely free text — a shop explaining itself in its own words.
 */
export function declineTimelineNote(id: DeclineReasonId, detail: string): string {
  const reason = findDeclineReason(id);
  const base = reason?.timelineNote ?? "Declined by supplier";
  const trimmed = detail.trim();
  return trimmed ? `${base}. ${trimmed}` : base;
}
