import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import { custodyForOrder } from "@/lib/handoff";
import { primaryAction } from "@/lib/jobState";
import { linkOnlySummary, orderDesignLinks } from "@/lib/designLink";
import { earningsSplit, milestoneViews, nextShopProof, payoutPlanCopy } from "@/lib/milestones";
import { orderArtwork } from "@/lib/orderArtwork";
import { progressPhotoSummary, showsProgressPhotos } from "@/lib/productionPhoto";
import { refundStanding } from "@/lib/refund";
import { unreleasedMinor } from "@/lib/payout";
import { orderProductionItems, readableSpec } from "@/lib/productionSpecs";

/**
 * The job brief: everything a shop weighs before it accepts or declines, folded
 * into a docket of named sections.
 *
 * Each section carries a one-line summary — the selected facts, not a label —
 * so a shop reads the whole offer from the closed docket and opens only the
 * part it wants to inspect. That is the rule this module exists to hold: a
 * closed row must still answer its own question. "Artwork" says nothing; "2
 * print files" does.
 *
 * Money stays the shop's own price and never the client's total; the padded
 * date the client was promised is withheld from this app on purpose, so the
 * delivery row states `readyBy`, the date the shop is actually held to.
 */

export type JobBriefSectionId =
  | "make"
  | "artwork"
  | "mockup"
  | "delivery"
  | "earnings"
  | "progress"
  | "handoff"
  | "history";

export type JobBriefSection = {
  id: JobBriefSectionId;
  /** What the section is, in the shop's words. */
  title: string;
  /** The selected facts, in one line. Never a restatement of the title. */
  summary: string;
  /** True when there is nothing behind the row — it still reads, but does not open. */
  empty?: boolean;
};

export const DEFAULT_BRIEF_SECTIONS: JobBriefSectionId[] = [
  "make",
  "artwork",
  "mockup",
  "delivery",
  "earnings",
];

type BriefOrder = Pick<
  Order,
  | "state"
  | "riderId"
  | "payoutMilestones"
  | "payoutPlanVersion"
  | "payoutHold"
  | "refundHold"
  | "refundDisposition"
  | "supplierSettlementPayouts"
  | "id"
  | "title"
  | "quantity"
  | "size"
  | "material"
  | "finish"
  | "productionItems"
  | "artworkFileIds"
  | "mockupFileIds"
  | "readyBy"
  | "promisedDate"
  | "deadline"
  | "address"
  | "deliveryDistanceMeters"
  | "supplierPriceMinor"
  | "timeline"
  | "pickupChecklist"
  | "pickupCountItems"
  | "productionProgress"
>;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "500 × Flyers · A5 · 130gsm gloss", or the count when the job has several items. */
export function makeSummary(order: BriefOrder): string {
  const items = orderProductionItems(order);
  if (items.length > 1) {
    const pieces = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    return `${plural(items.length, "item", "items")} · ${plural(pieces, "piece", "pieces")}`;
  }
  const [item] = items;
  const spec = item.structuredSpec ?? {};
  const parts = [
    `${item.quantity} × ${item.itemName}`,
    typeof spec.size === "string" && spec.size ? readableSpec(spec.size) : null,
    typeof spec.material === "string" && spec.material ? readableSpec(spec.material) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Print files and design links both count: a link is artwork, never "no print file". */
export function artworkSummary(order: BriefOrder): { summary: string; empty: boolean } {
  const count = orderArtwork(order).filter((file) => file.kind === "artwork").length;
  const links = orderDesignLinks(order);
  if (!count && !links.length) return { summary: "No print file attached yet", empty: true };
  if (!count) return { summary: linkOnlySummary(links), empty: false };
  const files = plural(count, "print file", "print files");
  return { summary: links.length ? `${files} · ${plural(links.length, "design link", "design links")}` : files, empty: false };
}

export function mockupSummary(order: BriefOrder): { summary: string; empty: boolean } {
  const count = orderArtwork(order).filter((file) => file.kind === "mockup").length;
  if (!count) return { summary: "None attached — go by the artwork", empty: true };
  return { summary: plural(count, "reference picture", "reference pictures"), empty: false };
}

/** The date the shop is held to first; the client's need-by only when GRIDGO has not set one. */
export function deliverySummary(order: BriefOrder): string {
  if (order.readyBy) return `Ready by ${formatDeadlineFull(order.readyBy)}`;
  const needBy = order.promisedDate || order.deadline;
  if (needBy) return `Client needs it by ${formatDeadlineFull(needBy)}`;
  return "Date not set yet";
}

export function distanceLabel(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m from your shop`;
  return `${(meters / 1000).toFixed(1)} km from your shop`;
}

/**
 * Before the job is accepted, the price and how it pays out. Once GRIDGO has
 * split it into milestones, where the money has got to — released, waiting on
 * the shop's own evidence, or still to come — because that is the question a
 * shop opens this row to answer.
 */
export function earningsSummary(order: BriefOrder): string {
  const split = earningsSplit(order as Order);
  // Settled: the total is what the shop keeps now, and "paid in full" would
  // be read against the original price.
  if (split.supersededMinor > 0) {
    if (split.totalMinor === 0) return "Settled · no payout due";
    if (split.releasedMinor >= split.totalMinor) return `${formatPhp(split.totalMinor)} · settled and released`;
    return `${formatPhp(split.releasedMinor)} of ${formatPhp(split.totalMinor)} · settled`;
  }
  if (split.totalMinor > 0) {
    if (split.held) {
      return refundStanding(order) === "paused"
        ? `${formatPhp(split.totalMinor)} · paused for refund`
        : `${formatPhp(split.totalMinor)} · on hold`;
    }
    if (split.needsProofMinor > 0) return `${formatPhp(split.needsProofMinor)} waiting on your proof`;
    if (split.releasedMinor >= split.totalMinor) return `${formatPhp(split.totalMinor)} · paid in full`;
    if (split.releasedMinor > 0) {
      return `${formatPhp(split.releasedMinor)} released of ${formatPhp(split.totalMinor)}`;
    }
    return `${formatPhp(unreleasedMinor(split))} still to come`;
  }
  if (order.supplierPriceMinor == null) return "Price not recorded yet";
  return `${formatPhp(order.supplierPriceMinor)} · paid in ${payoutPlanCopy(order).parts} parts`;
}

/** Where the package is between the counter and the client, for the pickup row. */
export function handoffSummary(order: BriefOrder): string {
  return custodyForOrder(order).label;
}

/** True once the package is ready to leave, until the client has it. */
export function hasHandoff(order: BriefOrder): boolean {
  return ["ready", "rider_assigned", "pickup_blocked", "with_rider"].includes(custodyForOrder(order).state);
}

export function historySummary(order: BriefOrder): { summary: string; empty: boolean } {
  const count = order.timeline?.length ?? 0;
  if (!count) return { summary: "Nothing recorded yet", empty: true };
  return { summary: plural(count, "update", "updates"), empty: false };
}

/** The docket, in the order a shop reads it: what, with what, how it should look, where and when, for how much. */
export function jobBriefSections(
  order: BriefOrder,
  include: JobBriefSectionId[] = DEFAULT_BRIEF_SECTIONS,
): JobBriefSection[] {
  const all: Record<JobBriefSectionId, JobBriefSection> = {
    make: { id: "make", title: "What to make", summary: makeSummary(order) },
    artwork: { id: "artwork", title: "Artwork", ...artworkSummary(order) },
    mockup: { id: "mockup", title: "How it should look", ...mockupSummary(order) },
    delivery: { id: "delivery", title: "Where and when", summary: deliverySummary(order) },
    earnings: { id: "earnings", title: "Your earnings", summary: earningsSummary(order) },
    progress: { id: "progress", title: "Production photos", ...progressPhotoSummary(order) },
    handoff: { id: "handoff", title: "Pickup", summary: handoffSummary(order) },
    history: { id: "history", title: "What happened so far", ...historySummary(order) },
  };
  return include.map((id) => all[id]);
}

/**
 * The rows the job workspace draws for this job. The pickup row exists only
 * while there is a package to hand over; everything else is always there,
 * because a shop mid-production still goes back to the artwork.
 */
export function workspaceBriefSections(order: BriefOrder): JobBriefSectionId[] {
  return [
    "make",
    "artwork",
    "mockup",
    "delivery",
    "earnings",
    // What the client sees of the work; only once GRIDGO keeps a count of it.
    ...(showsProgressPhotos(order) ? (["progress"] as const) : []),
    ...(hasHandoff(order) ? (["handoff"] as const) : []),
    "history",
  ];
}

/**
 * The row that starts open: the one the job's next step is about.
 *
 * Deciding or about to start printing, the shop reads the specification.
 * Owing evidence, or past the counter, it is watching the money. With a rider
 * on the way, it is the pickup — unless the rider's check stopped it, when the
 * shop is fixing the work against the specification. Nothing else opens itself.
 */
export function defaultBriefSection(order: BriefOrder): JobBriefSectionId {
  // A refund stops the work; what the shop keeps is the question left.
  if (refundStanding(order) !== "none") return "earnings";
  // A stopped pickup has its own panel; fixing it starts from the specification.
  if (custodyForOrder(order).state === "pickup_blocked") return "make";
  if (hasHandoff(order)) return "handoff";
  if (nextShopProof(order as Order)) return "earnings";
  const step = primaryAction(order)?.kind;
  if (
    step === "accept" ||
    step === "start_production" ||
    step === "ready_for_pickup" ||
    step === "add_production_photo" ||
    step === "add_packing_photo"
  ) {
    return "make";
  }
  return milestoneViews(order as Order).length ? "earnings" : "make";
}
