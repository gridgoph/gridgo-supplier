import type { Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { DO_NOT_PACK_YET, finishedStage, riderPacking, ridersPack } from "@/lib/shopHandover";

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
  | "pickup_blocked"
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
  /**
   * Where `detail` is a situation followed by the one thing to do with the
   * products now, the two apart, so the handover screen can lead with the
   * situation and say the instruction once, on its own.
   */
  now?: { situation: string; instruction: string };
  /** Whose move it is now. */
  nextActor: "You" | "Rider" | "Operations" | "Client";
};

export function custodyForOrder(
  order: Pick<Order, "state" | "riderId" | "pickupChecklist"> &
    Partial<Pick<Order, "handoverFlow" | "shopHandover" | "supplierId">>,
): Custody {
  // A failed counter check keeps the package with the shop while the rider waits.
  if (order.state === "rider_assigned" && order.pickupChecklist?.status === "failed_escalated") {
    return {
      state: "pickup_blocked",
      label: "Pickup blocked at the counter",
      tone: "error",
      icon: "circle-x",
      detail:
        "The rider's check did not pass, so the package stays with your shop. Fix it with Operations; the rider will check again.",
      nextActor: "You",
    };
  }
  const newer = ridersPack(order) ? riderPacksCustody(order) : null;
  if (newer) return newer;
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
          "A rider has accepted and is travelling to your shop. The rider counts every piece and runs the six pickup checks together with you at the counter, then records the result before the package leaves.",
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
 * Custody on the newer handover, where the shop packs at the counter in front
 * of the rider and custody moves only at its signature. Null where the older
 * words already hold (with the rider, delivered).
 */
function riderPacksCustody(
  order: Pick<Order, "state" | "riderId" | "pickupChecklist"> &
    Partial<Pick<Order, "handoverFlow" | "shopHandover" | "supplierId">>,
): Custody | null {
  const counter = riderPacking(order);
  switch (order.state) {
    case "ready_for_dispatch":
      return {
        state: "ready",
        label: "Waiting for a rider",
        tone: "info",
        icon: "clock",
        detail: `Riders have been notified. ${DO_NOT_PACK_YET}`,
        now: { situation: "Riders have been notified.", instruction: DO_NOT_PACK_YET },
        nextActor: "Rider",
      };
    case "rider_assigned":
      if (counter?.step === "pack") {
        return {
          state: "rider_assigned",
          label: "Checked at the counter",
          tone: "info",
          icon: "circle-check",
          detail:
            "Every check on the unpacked products passed. Pack the job now, in front of the rider, so they can photograph it packed.",
          nextActor: "You",
        };
      }
      if (counter?.step === "sign") {
        return {
          state: "rider_assigned",
          label: "Packed in front of the rider",
          tone: "info",
          icon: "circle-check",
          detail: "The rider photographed the packed job. Sign on the rider's phone to hand it over; until then it stays with your shop.",
          nextActor: "You",
        };
      }
      return {
        state: "rider_assigned",
        label: "Rider on the way",
        tone: "info",
        icon: "clock",
        detail:
          "Keep the products unpacked and your packing materials ready. At the counter the rider checks the unpacked products first; then you pack in front of them and sign on their phone.",
        nextActor: "Rider",
      };
    case "picked_up":
    case "out_for_delivery":
    case "awaiting_collection":
    case "delivered":
    case "issue_window_open":
    case "completed":
    case "payout_released":
      return null;
    default:
      if (finishedStage(order)?.stage === "approved") {
        return {
          state: "in_shop",
          label: "Your shop holds this job",
          tone: "neutral",
          icon: "clock",
          detail: `GRIDGO approved your finished products. Mark the job ready for rider pickup. ${DO_NOT_PACK_YET}`,
          now: {
            situation: "GRIDGO approved your finished products. Mark the job ready for rider pickup.",
            instruction: DO_NOT_PACK_YET,
          },
          nextActor: "You",
        };
      }
      return {
        state: "in_shop",
        label: "Your shop holds this job",
        tone: "neutral",
        icon: "clock",
        detail:
          "Send photos of the finished, unpacked products for GRIDGO's review. Once it approves, you call a rider. Do not pack yet; you pack at the counter, in front of the rider.",
        nextActor: "You",
      };
  }
}

/**
 * What the shop's packing step sets in motion on the newer handover, in order:
 * nothing is packed until the rider has checked the unpacked products.
 */
export const RIDER_PACKS_SEQUENCE = [
  {
    id: "notified",
    title: "Riders are notified",
    detail: "Approved riders see this job in their Offers, and one of them accepts it.",
  },
  {
    id: "arrives",
    title: "The rider comes to your counter",
    detail: "Have your packing materials ready and the products unpacked. If you already packed it, unpack it for the check.",
  },
  {
    id: "checks",
    title: "The rider checks the unpacked products",
    detail:
      "The rider counts every piece against the order and checks it against the spec, for visible defects and the paperwork, and looks over your packing materials.",
  },
  {
    id: "packs",
    title: "You pack it in front of the rider",
    detail: "Once every check passes, pack the job at the counter. The rider photographs it packed.",
  },
  {
    id: "signs",
    title: "You sign on the rider's phone",
    detail: "Your signature hands it over. A failed check keeps the job with you until you fix it with Operations.",
  },
] as const;

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
      "The rider counts every piece against the order, then runs the six pickup checks with you: the count, the item against the spec, visible defects, the packing, the paperwork, and your sign-off.",
  },
  {
    id: "leaves",
    title: "It leaves when every check passes",
    detail:
      "The rider records the result in their GRIDGO app. A failed check or a wrong count keeps the package with you until you fix it with Operations and the rider checks again.",
  },
] as const;

/**
 * The shop's own invoice stays out of the package. GRIDGO buys the job from the
 * shop and gives the customer GRIDGO's receipt, so a shop invoice in the box
 * tells the customer a price and a seller that are not theirs. The shop keeps
 * it for GRIDGO instead, which collects invoices from every shop monthly.
 * Drawn wherever the shop packs or hands over finished work.
 */
export const PACKAGE_INVOICE_REMINDER = {
  title: "No invoice or receipt in the package",
  keep: "Keep your invoice for GRIDGO. It collects invoices from each shop monthly.",
  /** The reason, one tap away: the rule is the title. */
  detail:
    "Do not put your own invoice or receipt inside the package. GRIDGO buys this job from you and gives the customer its own receipt.",
} as const;
