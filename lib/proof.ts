import type { Order } from "@/lib/api";

/**
 * Reading the proof conversation off the order timeline.
 *
 * When a client asks for changes, GRIDGO records their reason as the timeline
 * note on the state change. That reason is the whole point of the round trip,
 * so the shop should never have to hunt for it.
 */

/** The client's most recent change request, or null. */
export function lastChangeRequest(order: Pick<Order, "timeline">): string | null {
  for (let i = order.timeline.length - 1; i >= 0; i -= 1) {
    const entry = order.timeline[i];
    if (entry.state === "supplier_proof_changes_requested") {
      const note = entry.note?.trim();
      return note || null;
    }
  }
  return null;
}
