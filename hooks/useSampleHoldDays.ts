import { useEffect, useState } from "react";

import * as api from "@/lib/api";

/** GRIDGO's shipped hold, until `GET /settings` says otherwise. */
export const DEFAULT_SAMPLE_HOLD_DAYS = 14;

let known: number | null = null;

/**
 * How long a client who approved a sample keeps the shop's old prices
 * (`sampleBatchHoldDays`, Super Admin's setting). Read rather than assumed,
 * the same way `useA3Limit` reads its limit; a failed read keeps the default.
 */
export function useSampleHoldDays(): number {
  const [days, setDays] = useState(known ?? DEFAULT_SAMPLE_HOLD_DAYS);
  useEffect(() => {
    let live = true;
    api
      .getSettings()
      .then((settings) => {
        const value = settings.sampleBatchHoldDays;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return;
        known = value;
        if (live) setDays(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return days;
}
