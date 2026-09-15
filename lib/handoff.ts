import type { Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Custody: who is physically holding the job right now.
 *
 * This is the moment a printed order can actually be lost, so the state is
 * always stated in full — who has it, what happens next, and who acts. The
 * supplier can only move the job as far as "ready for pickup"; the rider's
 * six-check confirmation is what transfers custody, and this module never pretends otherwise.
 */

export type CustodyState =
  | "in_shop"
  | "ready"
  | "rider_assigned"
  | "with_rider"
  | "delivered";

export type Custody = {
  state: CustodyState;
  /** Says who holds it: "Your shop holds this job". */
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** What happens next and who does it. */
  detail: string;
  /** Whose move it is now. */
  nextActor: "You" | "Rider" | "Operations" | "Client";
};

export function custodyForOrder(order: Pick<Order, "state" | "riderId">): Custody {
  switch (order.state) {
    case "ready_for_dispatch":
      return {
        state: "ready",
        label: "Waiting for a rider",
        tone: "info",
        icon: "clock",
        detail:
          "Riders have been notified. Keep the package at the counter for the joint checks when a rider accepts and arrives.",
        nextActor: "Rider",
      };
    case "rider_assigned":
      return {
        state: "rider_assigned",
        label: "Rider on the way",
        tone: "info",
        icon: "clock",
        detail:
          "A rider has accepted and is travelling to your shop. Run the six pickup checks together at the counter. The rider records the result before the package leaves.",
        nextActor: "Rider",
      };
    case "picked_up":
    case "out_for_delivery":
    // A collected job is with GRIDGO from the shop's point of view either way:
    // it left, and getting it to the client is no longer the shop's leg.
    case "awaiting_collection":
      return {
        state: "with_rider",
        label: "Rider has the job",
        tone: "success",
        icon: "circle-check",
        detail:
          "Custody transferred. The rider confirmed pickup, so the job is no longer your shop's responsibility.",
        nextActor: "Rider",
      };
    case "delivered":
    case "issue_window_open":
    case "completed":
    case "payout_released":
      return {
        state: "delivered",
        label: "Delivered to the client",
        tone: "success",
        icon: "circle-check",
        detail: "The client has the job. Protected payment settles from here.",
        nextActor: "Operations",
      };
    default:
      return {
        state: "in_shop",
        label: "Your shop holds this job",
        tone: "neutral",
        icon: "clock",
        detail:
          "Mark the job ready for pickup when it is packed. A rider will come to your counter and you check it together before it leaves.",
        nextActor: "You",
      };
  }
}

/**
 * What marking the package ready sets in motion, in order. There is no shop-side
 * checklist: readiness is one signal, and quality and count are checked with
 * the rider at the counter.
 */
export const HANDOFF_SEQUENCE = [
  {
    id: "notified",
    title: "Riders are notified",
    detail: "Approved riders see this job in their Offers, and one of them accepts it.",
  },
  {
    id: "arrives",
    title: "The rider comes to your counter",
    detail: "Keep the package at the counter. Do not hand it over before the checks.",
  },
  {
    id: "checks",
    title: "You check it together",
    detail:
      "The six pickup checks, done with the rider: the count against the order, the item against the spec, visible defects, the packing, the paperwork, and your sign-off.",
  },
  {
    id: "leaves",
    title: "It leaves when every check passes",
    detail:
      "The rider records the result in their GRIDGO app. A failed check keeps the package with you until Operations resolves it.",
  },
] as const;
