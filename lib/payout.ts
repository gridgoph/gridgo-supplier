import type { MilestoneCode, Order } from "@/lib/api";
import {
  addSplits,
  earningsSplit,
  milestoneDefinition,
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
  return (
    split.needsProofMinor + split.awaitingReleaseMinor + split.heldMinor + split.laterMinor
  );
}

// ---------------------------------------------------------------------------
// The statement
// ---------------------------------------------------------------------------

/**
 * One release, as a line a shop can reconcile against its own bank.
 *
 * A job row answers "how is this job going". It cannot answer "what did GRIDGO
 * send me last month", because one job's parts land on different days and a
 * shop reads its bank by date, not by job.
 */
export type StatementLine = {
  orderId: string;
  title: string;
  code: MilestoneCode;
  /** What the shop calls this part. */
  label: string;
  amountMinor: number;
  /** ISO instant the money was released. Never null: unreleased parts are not statement lines. */
  releasedAt: string;
  /** The wallet's reference for the transfer, when Operations typed one. */
  reference: string | null;
  /** The wallet receipt screenshot Operations kept, when one was attached. */
  receiptFileId: string | null;
};

export function statementLines(jobs: Order[]): StatementLine[] {
  const lines: StatementLine[] = [];
  for (const job of jobs) {
    for (const milestone of job.payoutMilestones ?? []) {
      if (milestone.status !== "released" || !milestone.releasedAt) continue;
      lines.push({
        orderId: job.id,
        title: job.title,
        code: milestone.code,
        label: milestoneDefinition(milestone.code, milestone).label,
        amountMinor: milestone.amountMinor,
        releasedAt: milestone.releasedAt,
        reference: milestone.reference ?? null,
        receiptFileId: milestone.receiptFileId ?? null,
      });
    }
  }
  // Newest first: a shop opening this is checking what just arrived.
  return lines.sort((left, right) => right.releasedAt.localeCompare(left.releasedAt));
}

/**
 * A calendar month of releases, in Davao time.
 *
 * Real accounting periods rather than a rolling window, because the figure has
 * to mean the same thing in August every time it is opened -- that is the whole
 * use of it, which is handing it to somebody who keeps the books.
 */
export type StatementMonth = {
  /** `YYYY-MM`, so it sorts and keys without a Date. */
  key: string;
  /** "August 2026", for the screen. */
  label: string;
  totalMinor: number;
  releaseCount: number;
};

const MANILA = "Asia/Manila";

/** The Davao month a release landed in. Never the phone's own timezone. */
export function statementMonthKey(releasedAt: string): string | null {
  const parsed = Date.parse(releasedAt);
  if (Number.isNaN(parsed)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(parsed));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
}

export function statementMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA,
    year: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

export function statementMonths(lines: StatementLine[]): StatementMonth[] {
  const totals = new Map<string, { totalMinor: number; releaseCount: number }>();
  for (const line of lines) {
    const key = statementMonthKey(line.releasedAt);
    if (!key) continue;
    const bucket = totals.get(key) ?? { totalMinor: 0, releaseCount: 0 };
    bucket.totalMinor += line.amountMinor;
    bucket.releaseCount += 1;
    totals.set(key, bucket);
  }
  return [...totals.entries()]
    .map(([key, bucket]) => ({ key, label: statementMonthLabel(key), ...bucket }))
    .sort((left, right) => right.key.localeCompare(left.key));
}
