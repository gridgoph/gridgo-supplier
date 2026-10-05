import type { Order } from "@/lib/api";
import { formatDeadlineFull, formatDeadlineTime } from "@/lib/dates";
import { toDayKey } from "@/lib/day";

/**
 * The shop's hour to answer a new job (gridgo-api `docs/SHOP_RECOVERY_API.md`).
 *
 * GRIDGO gives an assigned shop sixty minutes **of its opening time** to
 * accept or decline. No answer by then counts as a decline, goes on the shop's
 * record, and the job is offered elsewhere. `deadlineAt` is that moment
 * already walked through the shop's closed hours, so it is the one figure
 * this module trusts.
 *
 * Two shapes follow from it, and the difference is the whole point:
 *
 * - **running** — the hour sits inside one opening stretch, so the clock and
 *   the hour agree and a plain countdown is honest.
 * - **spans_closed** — the shop closes before the hour is up. The hour stops
 *   while the shop is shut and picks up when it opens, so a wall-clock
 *   countdown would race through the night and frighten a shop that still has
 *   most of its time. What is true is the moment it runs out, so that is what
 *   is said, beside the fact that it pauses.
 *
 * GRIDGO does not send this app the shop's opening hours, so the app cannot
 * say *which* minutes are paused — only that some are. The gap between the
 * wall-clock span and the sixty working minutes is what tells it.
 */

export type AcceptWindow =
  | { kind: "none" }
  | {
      kind: "running";
      deadlineAt: Date;
      remainingMs: number;
      /** Share of the hour already gone, 0–1, for the bar. */
      elapsed: number;
      /** Ten minutes or less to go. */
      closing: boolean;
    }
  | { kind: "spans_closed"; deadlineAt: Date }
  /** Past the deadline on this phone; GRIDGO records it within seconds. */
  | { kind: "expired"; deadlineAt: Date };

const MINUTE_MS = 60_000;
/** Seconds of rounding between the server's walk and the wall clock. */
const SPAN_TOLERANCE_MS = MINUTE_MS;
const CLOSING_MS = 10 * MINUTE_MS;

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/** Where this job's answer window stands, or `none` when it has no clock. */
export function acceptWindow(
  order: Pick<Order, "state" | "shopAcceptance" | "shopRecovery">,
  now: Date = new Date(),
): AcceptWindow {
  const window = order.shopAcceptance;
  if (order.state !== "supplier_assigned" || order.shopRecovery || window?.status !== "pending") {
    return { kind: "none" };
  }
  const deadline = time(window.deadlineAt);
  const assigned = time(window.assignedAt);
  if (deadline == null) return { kind: "none" };
  const deadlineAt = new Date(deadline);
  const remainingMs = deadline - now.getTime();
  if (remainingMs <= 0) return { kind: "expired", deadlineAt };

  const workingMs = (window.workingMinutes > 0 ? window.workingMinutes : 60) * MINUTE_MS;
  const spanMs = assigned == null ? workingMs : deadline - assigned;
  if (spanMs > workingMs + SPAN_TOLERANCE_MS) return { kind: "spans_closed", deadlineAt };

  return {
    kind: "running",
    deadlineAt,
    remainingMs,
    elapsed: Math.min(1, Math.max(0, 1 - remainingMs / workingMs)),
    closing: remainingMs <= CLOSING_MS,
  };
}

/** "42:07" — minutes and seconds, the way a timer reads. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "8:50 AM", "8:50 AM tomorrow", or the full date when further out. */
export function answerByTime(deadlineAt: Date, now: Date = new Date()): string {
  const iso = deadlineAt.toISOString();
  const today = toDayKey(now);
  const tomorrow = toDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const day = toDayKey(deadlineAt);
  if (day === today) return formatDeadlineTime(iso);
  if (day === tomorrow) return `${formatDeadlineTime(iso)} tomorrow`;
  return formatDeadlineFull(iso);
}

/**
 * One line for a job card or the floor: what the shop has left. Null when the
 * job has no answer clock.
 */
export function acceptWindowLine(window: AcceptWindow, now: Date = new Date()): string | null {
  switch (window.kind) {
    case "running": {
      const minutes = Math.ceil(window.remainingMs / MINUTE_MS);
      return minutes <= 1 ? "Under a minute left to answer" : `${minutes} min left to answer`;
    }
    case "spans_closed":
      return `Answer by ${answerByTime(window.deadlineAt, now)}`;
    case "expired":
      return "Time to answer has run out";
    default:
      return null;
  }
}

/** How often a screen showing this window should redraw. */
export function acceptWindowTickMs(window: AcceptWindow): number | null {
  if (window.kind === "running") return 1000;
  if (window.kind === "spans_closed") return 30_000;
  return null;
}
