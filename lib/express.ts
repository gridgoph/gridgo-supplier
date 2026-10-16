import type { Order } from "@/lib/api";
import type { Listing } from "@/lib/listings";

/**
 * Express (gridgo-api `docs/EXPRESS_API.md`).
 *
 * A shop switches Express on per listing. While it is on, clients can pick any
 * deadline from today, today included, and GRIDGO promises it for that listing
 * even where ordinary production time would miss it. No extra charge. The
 * switch applies at once and never enters listing review, so it is saved on its
 * own (`saveListing(listing, { express })`), never with the held words.
 *
 * Checkout tags the order `express: true` when it promised the order that way.
 * The tag never changes afterwards, so a job stays Express even if the shop
 * later switches its listing off.
 *
 * The words match the supplier website's, so a shop reads one Express.
 */

export const EXPRESS_LABEL = "Express";

/** Orders placed before Express carry no field; that reads as not Express. */
export function isExpressOrder(order: Pick<Order, "express"> | null | undefined): boolean {
  return order?.express === true;
}

/** A listing from a GRIDGO without the field is not Express, and gets no switch. */
export function isExpressListing(listing: Pick<Listing, "express">): boolean {
  return listing.express === true;
}

/** The listing editor's explanation beside the switch. */
export const EXPRESS_SWITCH_HELP =
  "Clients can pick any deadline from today, the same day included, and GRIDGO promises same-day work for this listing even when your production time is longer. There is no extra charge.";

/** What turning it on asks of the shop. */
export const EXPRESS_SWITCH_CAUTION =
  "Turn it on only if you can finish an order the day it comes in. It changes at once, with no review.";

export function expressStateLine(on: boolean): string {
  return on
    ? "Express is on. Clients can choose today as their deadline."
    : "Express is off. Deadlines follow your production time.";
}

/**
 * A stale refusal under the switch. The editor reads the listing again, so
 * the switch already shows what GRIDGO has; there is nothing to pull down.
 */
export const EXPRESS_STALE =
  "This listing changed on another device, so Express was not changed. The switch shows what GRIDGO has now. Change it again if you still want to.";

/** The job screen: what an Express order promised. */
export const EXPRESS_JOB_NOTE =
  "GRIDGO promised this order for the client's deadline under Express, even if that is today.";
