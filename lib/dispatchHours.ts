import type { Order } from "@/lib/api";
import { refundStanding } from "@/lib/refund";
import { manilaClock, timeLabel } from "@/lib/shopHours";
import { shopRelease } from "@/lib/shopRecovery";

/**
 * GRIDGO's dispatch hours, as far as the shop needs them.
 *
 * Riders only see a new pickup while GRIDGO is open (gridgo-api
 * `docs/OPERATING_HOURS_API.md#work-gates-and-prospective-sla-clocks`). A shop
 * can still mark a job ready after closing, so it is told when riders will see
 * it, or the job looks lost. The times come from `operatingStatus` on
 * `GET /settings`, the live schedule dispatch itself uses, and are always said
 * in Manila time whatever the phone's own time zone is.
 *
 * GRIDGO hides `operatingClock` from the shop, so a job placed before those
 * hours existed reads the same here, although riders can still see it.
 */

export type DispatchHours = {
  isOpenNow: boolean;
  /** The next opening while closed. */
  nextOpenAt: string | null;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Null for a GRIDGO that sends no status: nothing is said rather than guessed. */
export function readDispatchHours(raw: unknown): DispatchHours | null {
  if (!raw || typeof raw !== "object") return null;
  const { isOpenNow, scheduledReviewAt } = raw as Record<string, unknown>;
  if (typeof isOpenNow !== "boolean") return null;
  const parses = typeof scheduledReviewAt === "string" && Number.isFinite(Date.parse(scheduledReviewAt));
  return { isOpenNow, nextOpenAt: parses ? (scheduledReviewAt as string) : null };
}

/** "8:00 AM today", "8:00 AM tomorrow", "8:00 AM on Monday", "8:00 AM on Mon, Dec 28". */
export function openingLabel(at: Date, now: Date): string {
  const opening = manilaClock(at);
  const time = timeLabel(opening.minute);
  const days = Math.round((Date.parse(opening.dayKey) - Date.parse(manilaClock(now).dayKey)) / DAY_MS);
  if (days === 0) return `${time} today`;
  if (days === 1) return `${time} tomorrow`;
  // A long closure can pass the same weekday again, and then only the date is clear.
  if (days < 7) return `${time} on ${WEEKDAYS[opening.weekday]}`;
  const date = at.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${time} on ${date}`;
}

/** The one line a shop is told while dispatch is closed. Null while it is open, or unknown. */
export function dispatchClosedLine(hours: DispatchHours | null, now: Date): string | null {
  if (!hours || hours.isOpenNow || !hours.nextOpenAt) return null;
  const at = new Date(hours.nextOpenAt);
  // A read from before the opening: riders can see the job by now.
  if (at.getTime() <= now.getTime()) return null;
  return `Riders can pick this up from ${openingLabel(at, now)}.`;
}

/** A job ready and waiting for a rider to take it, with nothing else stopping it. */
export function waitsForDispatch(
  order: Pick<Order, "state" | "riderId" | "refundHold" | "refundDisposition" | "shopAcceptance" | "shopRecovery">,
): boolean {
  return (
    order.state === "ready_for_dispatch" &&
    !order.riderId &&
    refundStanding(order) === "none" &&
    !shopRelease(order)
  );
}
