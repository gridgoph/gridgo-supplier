import { useState } from "react";

import type { Order } from "@/lib/api";
import { isExpressDocumentOrder } from "@/lib/expressOrder";

/**
 * The Express order as this screen last saw it, once GRIDGO stops showing it.
 *
 * A declined or timed-out Express order goes to the next shop at once, so the
 * next read (a live refresh, a focus) answers 403 and `useJob` drops it. The
 * shop must still see "Declined" / "Time's up", not "This job is not
 * reachable". Only Express orders are held; every other job reads as before.
 */
export function useLastExpressJob(job: Order | null): Order | null {
  const [held, setHeld] = useState<Order | null>(null);
  if (job && job !== held && isExpressDocumentOrder(job)) setHeld(job);
  return job ?? held;
}
