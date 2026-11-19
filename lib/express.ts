import type { Order } from "@/lib/api";

/**
 * Express orders (gridgo-api `docs/EXPRESS_API.md`).
 *
 * The listing switch came back with document Express: a per-page Document
 * printing listing that is on the board and approved can take Express orders
 * (`express: true`, saved on its own, never reviewed). Its production time is
 * still set with "How long does this take?" like any other. Orders placed
 * under the older scheduling Express keep their `express: true` tag for good.
 */

export const EXPRESS_LABEL = "Express";

/**
 * Wears the Express tag: the older scheduling promise, or an order placed
 * through Express's document flow (`lib/expressOrder.ts`). Orders placed
 * before Express carry neither field; that reads as not Express.
 */
export function isExpressOrder(order: Partial<Pick<Order, "express" | "orderType">> | null | undefined): boolean {
  return order?.express === true || order?.orderType === "express";
}

/** The job screen: what an Express order promised. */
export const EXPRESS_JOB_NOTE =
  "GRIDGO promised this order for the client's deadline under Express, even if that is today.";

/** The listing editor's Express opt-in (gridgo-api `docs/EXPRESS_API.md`). */
export const EXPRESS_SWITCH_LABEL = "Take Express orders";
export const EXPRESS_SWITCH_HINT =
  "Nearby clients send files to print now. You get 5 minutes to accept each one.";

/** Only a per-page Document printing listing can take Express orders. */
export function offersExpressSwitch(listing: { subcategoryCode?: string | null; pricingUnit?: string | null }): boolean {
  return listing.subcategoryCode === "document_printing" && listing.pricingUnit === "per_page";
}
