import type { Order } from "@/lib/api";

/**
 * Express orders (gridgo-api `docs/EXPRESS_API.md`).
 *
 * The listing switch is retired: an Express listing became a Same day listing
 * (gridgo-api `docs/SCHEDULING_API.md`, release 2), so a shop sets it with
 * "How long does this take?" like any other. Orders placed under Express keep
 * their `express: true` tag for good, and the job screens still say so.
 */

export const EXPRESS_LABEL = "Express";

/** Orders placed before Express carry no field; that reads as not Express. */
export function isExpressOrder(order: Pick<Order, "express"> | null | undefined): boolean {
  return order?.express === true;
}

/** The job screen: what an Express order promised. */
export const EXPRESS_JOB_NOTE =
  "GRIDGO promised this order for the client's deadline under Express, even if that is today.";
