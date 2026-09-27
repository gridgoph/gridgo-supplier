import type { Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * The rider's check at the counter, as the shop reads it.
 *
 * The rider owns this check: six yes-or-no answers and a piece count per line,
 * recorded on the rider's phone before the package leaves (gridgo-api
 * `docs/OPERATIONAL_MODEL_V2_API.md#counter-count`). This app only reads it
 * back. A failed check keeps the package with the shop until Operations
 * resolves it, and then the rider checks again from scratch.
 *
 * Nothing here is money. A counter check pays nobody and holds nothing back;
 * the payout stages in `lib/milestones.ts` stay as they are either way.
 */

/** The six checks in the platform's order, in words a shop uses. */
export const PICKUP_CHECKS: { code: string; phrase: string; label: string }[] = [
  { code: "quantity_match", phrase: "the count against the order", label: "Count against the order" },
  { code: "specification_match", phrase: "the item against the spec", label: "Item against the spec" },
  { code: "visible_defects", phrase: "visible defects", label: "Free of visible defects" },
  { code: "packaging_integrity", phrase: "the packing", label: "Packing" },
  { code: "documentation", phrase: "the paperwork", label: "Paperwork" },
  { code: "supplier_sign_off", phrase: "your sign-off", label: "Your sign-off" },
];

/** The platform writes this before Operations' instruction on the order's timeline. */
const RESOLVED_NOTE = "Pickup escalation resolved; repeat all six checks:";

export type CounterCheckStage = "blocked" | "recheck" | "passed";

export type CountRow = {
  key: string;
  name: string;
  expected: number;
  counted: number;
  /** "12 short", "3 extra", "Matches". */
  difference: string;
  matches: boolean;
};

export type CounterCheckView = {
  stage: CounterCheckStage;
  tone: StatusTone;
  icon: StatusIconName;
  /** The chip. */
  status: string;
  /** What the shop does about it, in one sentence. */
  headline: string;
  /** Where the package is and what happens next. */
  detail: string;
  checkedAt: string | null;
  failed: string[];
  passed: string[];
  /** Null on a check recorded before counts existed: "not recorded", never zero. */
  counts: CountRow[] | null;
  riderNote: string | null;
  /** Operations' instruction, once it has resolved the failed check. */
  operationsNote: string | null;
  signedBy: string | null;
};

function checkLabel(code: string): string {
  return PICKUP_CHECKS.find((check) => check.code === code)?.label ?? "Another check";
}

function difference(expected: number, counted: number): string {
  if (counted === expected) return "Matches";
  const gap = Math.abs(counted - expected);
  return counted < expected ? `${gap} short` : `${gap} extra`;
}

/** The line's name from the projection, or the job's title for a single old line. */
function lineName(order: Pick<Order, "title" | "pickupCountItems">, lineItemId: string | null): string {
  const item = order.pickupCountItems?.find((candidate) => candidate.lineItemId === lineItemId);
  return item?.itemName?.trim() || order.title || "This job";
}

/** Operations' instruction, when the latest resolution is newer than the check it answers. */
function resolution(order: Pick<Order, "timeline">, after: string | null): string | null {
  const entry = [...(order.timeline ?? [])]
    .reverse()
    .find((row) => row.note?.startsWith(RESOLVED_NOTE) && (!after || row.at >= after));
  const text = entry?.note.slice(RESOLVED_NOTE.length).trim();
  return text || null;
}

type CheckOrder = Pick<Order, "title" | "timeline" | "pickupChecklist" | "pickupCountItems">;

/**
 * The counter check to draw on a job, or null when no rider has checked it.
 *
 * `blocked` is the one that asks something of the shop. `recheck` means
 * Operations has cleared it and the rider will count again. `passed` is a
 * record of the handoff.
 */
export function counterCheck(order: CheckOrder): CounterCheckView | null {
  const checklist = order.pickupChecklist;
  if (!checklist) return null;

  const checks = checklist.checks ?? [];
  const failed = PICKUP_CHECKS.filter((check) =>
    checks.some((row) => row.code === check.code && !row.passed),
  ).map((check) => check.label);
  // A code the app does not know still counts as failed, in neutral words.
  for (const row of checks) {
    if (!row.passed && !PICKUP_CHECKS.some((check) => check.code === row.code)) {
      failed.push(checkLabel(row.code));
    }
  }
  const passed = PICKUP_CHECKS.filter((check) =>
    checks.some((row) => row.code === check.code && row.passed),
  ).map((check) => check.label);

  const counts = Array.isArray(checklist.counts)
    ? checklist.counts.map((row, index) => ({
        key: row.lineItemId ?? `line-${index}`,
        name: lineName(order, row.lineItemId),
        expected: row.expectedQuantity,
        counted: row.countedQuantity,
        difference: difference(row.expectedQuantity, row.countedQuantity),
        matches: row.countedQuantity === row.expectedQuantity,
      }))
    : null;

  const base = {
    checkedAt: checklist.completedAt ?? null,
    failed,
    passed,
    counts,
    riderNote: checklist.failureNote?.trim() || null,
    operationsNote: null,
    signedBy: checklist.handoffSignature?.signerName ?? null,
  };

  switch (checklist.status) {
    case "failed_escalated":
      return {
        ...base,
        stage: "blocked",
        tone: "error",
        icon: "circle-x",
        status: "Pickup blocked",
        headline: "Fix it with Operations; the rider will check again",
        detail:
          "The rider stopped the pickup at the counter. The package stays with you until Operations clears it and the rider checks it again.",
      };
    case "escalation_resolved":
      return {
        ...base,
        stage: "recheck",
        tone: "info",
        icon: "clock",
        status: "Rider will check again",
        headline: "Operations cleared it. The rider will check again",
        detail:
          "Keep the package at the counter. The rider repeats all six checks and the count, and you sign for the handoff again.",
        operationsNote: resolution(order, base.checkedAt),
      };
    case "passed":
      return {
        ...base,
        stage: "passed",
        tone: "success",
        icon: "circle-check",
        status: "Checked at the counter",
        headline: "All six checks passed",
        detail: base.signedBy ? `${base.signedBy} signed for the handoff.` : "The rider recorded the handoff.",
      };
    default:
      return null;
  }
}

/** True while a failed counter check keeps the package with the shop. */
export function isPickupBlocked(order: Pick<Order, "pickupChecklist">): boolean {
  return order.pickupChecklist?.status === "failed_escalated";
}

/** What the rider will count, per line — the shop can count it first. */
export function countTargets(
  order: Pick<Order, "title" | "pickupCountItems">,
): { key: string; name: string; expected: number }[] {
  return (order.pickupCountItems ?? []).map((item, index) => ({
    key: item.lineItemId ?? `line-${index}`,
    name: item.itemName?.trim() || order.title || "This job",
    expected: item.expectedQuantity,
  }));
}

/**
 * Check codes the platform writes into a note or an alert, in the shop's
 * words. A failed pickup reaches the timeline as "Pickup blocked and
 * escalated: visible_defects", and the shop's alert opens with the same codes.
 */
export function presentCheckCodes(text: string): string {
  let out = text;
  for (const { code, phrase } of PICKUP_CHECKS) out = out.replaceAll(code, phrase);
  return out;
}
