import { useEffect, useRef, useState } from "react";

import type { Listing } from "@/lib/listings";
import { loadProductionTimePreview, type BoardOutcome } from "@/lib/listingsApi";
import type { ProductionChoice } from "@/lib/productionDays";
import { previewQuery, type ProductionTimePreview } from "@/lib/productionTimePreview";

/** A stepper tapped five times asks GRIDGO once, for the last answer. */
export const PREVIEW_DEBOUNCE_MS = 400;

/**
 * GRIDGO's dates for the answer on screen, read after the shop stops tapping.
 *
 * The last answer's dates stay up while the next ones load (`updating`), so
 * the panel does not blink on every tap. A slow reply for an older answer is
 * dropped rather than drawn over a newer one.
 */
export function useProductionTimePreview(listing: Listing | null, choice: ProductionChoice | null) {
  const key = listing && choice ? `${listing.id}?${new URLSearchParams(previewQuery(choice))}` : null;
  const [answer, setAnswer] = useState<{ key: string; outcome: BoardOutcome<ProductionTimePreview> } | null>(null);
  const asked = useRef({ listing, choice });
  useEffect(() => {
    asked.current = { listing, choice };
  });

  useEffect(() => {
    if (!key) return;
    let live = true;
    const timer = setTimeout(() => {
      const { listing: current, choice: proposed } = asked.current;
      if (!current || !proposed) return;
      void loadProductionTimePreview(current, proposed).then((outcome) => {
        if (live) setAnswer({ key, outcome });
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);

  return {
    outcome: answer?.outcome ?? null,
    updating: key != null && answer?.key !== key,
  };
}
