import { useEffect, useState } from "react";

import * as api from "@/lib/api";
import { DEFAULT_A3_LIMIT_BPS } from "@/lib/colourPricing";

let known: number | null = null;

/**
 * The A3 monochrome limit in force, from `GET /settings`.
 *
 * Super Admin moves it as real orders come in, and the A3 tier labels carry
 * it ("Up to 10%, monochrome"), so the phone reads it rather than assuming.
 * Until it has, or when the read fails, GRIDGO's shipped 10% stands.
 */
export function useA3Limit(): number {
  const [limit, setLimit] = useState(known ?? DEFAULT_A3_LIMIT_BPS);
  useEffect(() => {
    let live = true;
    api
      .getSettings()
      .then((settings) => {
        const value = settings.colourDetection?.a3MonochromeMaxBps;
        if (typeof value !== "number" || !Number.isSafeInteger(value)) return;
        known = value;
        if (live) setLimit(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return limit;
}
