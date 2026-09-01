import type { Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Custody: who is physically holding the job right now.
 *
 * This is the moment a printed order can actually be lost, so the state is
 * always stated in full — who has it, what happens next, and who acts. The
 * supplier can only move the job as far as "ready for pickup"; the rider's
 * scan is what transfers custody, and this module never pretends otherwise.
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
          "GRIDGO is assigning a rider. Keep the packed job at the counter — the rider confirms pickup on their own app.",
        nextActor: "Operations",
      };
    case "rider_assigned":
      return {
        state: "rider_assigned",
        label: "Rider on the way",
        tone: "info",
        icon: "clock",
        detail:
          "A rider is assigned and travelling to your shop. Hand the job over and let them confirm pickup before they leave.",
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
          "No rider can be assigned until you mark the job ready for pickup.",
        nextActor: "You",
      };
  }
}

/** Physical checks the shop confirms before a rider is called. */
export const HANDOFF_CHECKS = [
  { id: "packed", label: "Packed and protected for transport" },
  { id: "labelled", label: "Labelled with the client name and job title" },
  { id: "counted", label: "Piece count matches the order quantity" },
  { id: "counter", label: "Staged at the counter for collection" },
] as const;

export type HandoffCheckId = (typeof HANDOFF_CHECKS)[number]["id"];

export function allHandoffChecksDone(checked: Record<string, boolean>): boolean {
  return HANDOFF_CHECKS.every((check) => checked[check.id] === true);
}

export function handoffChecksRemaining(checked: Record<string, boolean>): number {
  return HANDOFF_CHECKS.filter((check) => checked[check.id] !== true).length;
}
