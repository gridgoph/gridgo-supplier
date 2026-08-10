import type { Order } from "@/lib/api";
import {
  addSplits,
  earningsSplit,
  milestoneViews,
  type EarningsSplit,
  type MilestoneView,
} from "@/lib/milestones";

/**
 * What a shop is owed, read off the payout milestones the platform keeps.
 *
 * Every figure here is the shop's **own** earnings. The client's total, the
 * delivery fee and GRIDGO's commission are all somebody else's money and none
 * of them belong on this screen — the commission is not even sent to this app.
 *
 * Nothing is filtered by job status, because the three things a shop wants to
 * separate — evidence it still owes, evidence GRIDGO is reviewing, money that
 * has landed — are properties of a *milestone*, not of a job. One job routinely
 * holds all three at once, so the split lives inside each row.
 */

export type PayoutRow = {
  orderId: string;
  title: string;
  state: string;
  split: EarningsSplit;
  milestones: MilestoneView[];
  /** A claim is holding whatever has not been released yet. */
  held: boolean;
  /** When the client's window to report a problem closes, if it is open. */
  issueWindowExpiresAt: string | null;
};

/** Jobs with money attached: a price agreed means milestones exist. */
export function isPayoutRelevant(order: Pick<Order, "payoutMilestones">): boolean {
  return (order.payoutMilestones?.length ?? 0) > 0;
}

export function derivePayoutRow(order: Order): PayoutRow {
  return {
    orderId: order.id,
    title: order.title,
    state: order.state,
    split: earningsSplit(order),
    milestones: milestoneViews(order),
    held: order.payoutHold === true,
    issueWindowExpiresAt: order.issueWindowExpiresAt ?? null,
  };
}

export function payoutRows(jobs: Order[]): PayoutRow[] {
  return jobs.filter(isPayoutRelevant).map(derivePayoutRow);
}

/** The two ways a shop reads its ledger, plus everything. */
export type PayoutFilter = "unsettled" | "released" | "all";

export const PAYOUT_FILTERS: readonly { value: PayoutFilter; label: string }[] = [
  { value: "unsettled", label: "To settle" },
  { value: "released", label: "Released" },
  { value: "all", label: "All" },
] as const;

export function matchesPayoutFilter(row: PayoutRow, filter: PayoutFilter): boolean {
  if (filter === "all") return true;
  if (filter === "released") return row.split.releasedMinor > 0;
  return row.split.totalMinor > row.split.releasedMinor;
}

/**
 * Ordering: what the shop can act on first, then what GRIDGO is holding, then
 * what is done. A payout list sorted by date buries the one row that pays.
 */
export function sortPayoutRows(rows: PayoutRow[]): PayoutRow[] {
  const rank = (row: PayoutRow): number => {
    if (row.split.needsProofMinor > 0) return 0;
    if (row.held) return 1;
    if (row.split.awaitingReleaseMinor > 0) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

export function summarizePayouts(jobs: Order[]): EarningsSplit & { jobCount: number } {
  const rows = payoutRows(jobs);
  return { ...addSplits(rows.map((row) => row.split)), jobCount: rows.length };
}

/** Everything not yet in the shop's hands, however it is stuck. */
export function unreleasedMinor(split: EarningsSplit): number {
  return split.needsProofMinor + split.awaitingReleaseMinor + split.heldMinor;
}
