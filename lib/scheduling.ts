import type { Order } from "@/lib/api";
import { manilaClock, timeLabel } from "@/lib/shopHours";

/**
 * Tight deadlines and same-day jobs (gridgo-api `docs/SCHEDULING_API.md`).
 *
 * A client may pick a date between a listing's shortest and longest
 * production time. GRIDGO calls that **Tight** and tells the shop before it
 * accepts. During the pilot a Tight job may be declined with a reason and the
 * decline does not count against the shop: GRIDGO marks it
 * `tight_deadline_pilot` itself when the decline carries a reason, so the
 * ordinary decline route is all this app sends.
 *
 * The supplier projection is only `status`, `sameDay`, `tightDeadline` and
 * `label`. An older GRIDGO sends no `scheduling`, which reads as neither.
 */

export const TIGHT_DEADLINE_LABEL = "Tight deadline";

/** The one plain line under the badge. */
export const TIGHT_DEADLINE_LINE =
  "This date is inside your shortest–longest time. You may decline with a reason, with no penalty.";

/** Said where the shop declines a Tight job, in place of the record warning. */
export const TIGHT_DECLINE_NO_PENALTY =
  "This job has a tight deadline. A decline with a reason does not count against your shop during the pilot.";

/** What a late Tight or same-day job leads to during the pilot (`docs/SCHEDULING_API.md`). */
export const TIGHT_LATE_LINE =
  "A Tight or same-day job ready late gets its warning and nothing more: it does not lower your place, hide your shop from Top Pick, or send your shop to Operations for review.";

type SchedulingOrder = Pick<Order, "state" | "shopRecovery" | "scheduling" | "readyBy">;

/** Still waiting for the shop's answer: the only time the Tight badge is shown. */
function awaitingAnswer(order: SchedulingOrder): boolean {
  return order.state === "supplier_assigned" && !order.shopRecovery;
}

/** True when GRIDGO flagged this job Tight and the shop has yet to answer. */
export function isTightBeforeAccepting(order: SchedulingOrder | null | undefined): boolean {
  return !!order && awaitingAnswer(order) && order.scheduling?.tightDeadline === true;
}

/**
 * "Same-day job · ready by 3:00 PM" for a same-day job still waiting for an
 * answer, read from the shop's own `readyBy` in Manila time. Null otherwise,
 * or when that time is missing.
 */
export function sameDayReadyLine(order: SchedulingOrder | null | undefined): string | null {
  if (!order || !awaitingAnswer(order) || order.scheduling?.sameDay !== true) return null;
  const at = order.readyBy ? new Date(order.readyBy) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  return `Same-day job · ready by ${timeLabel(manilaClock(at).minute)}`;
}
