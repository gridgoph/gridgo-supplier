import { useCallback, useEffect, useRef, useState } from "react";

import type { Listing } from "@/lib/listings";
import { loadProductionTimePreview, type BoardOutcome } from "@/lib/listingsApi";
import type { ProductionChoice } from "@/lib/productionDays";
import { previewQuery, type ProductionTimePreview } from "@/lib/productionTimePreview";

/** A stepper tapped five times asks GRIDGO once, for the last answer. */
export const PREVIEW_DEBOUNCE_MS = 400;

/**
 * GRIDGO's dates for the answer on screen, read after the shop stops tapping.
 *
 * The dates also hang on the listing as saved — its faster price options, its
 * minimum order — so a newer version of it (a save here, or a change from
 * another device) asks again, as does `retry`. The last dates stay up while
 * the next ones load (`updating`), so the panel does not blink on every tap.
 * A slow reply for an older question is dropped rather than drawn over a
 * newer one.
 */
export function useProductionTimePreview(listing: Listing | null, choice: ProductionChoice | null) {
  const [attempt, setAttempt] = useState(0);
  const key =
    listing && choice
      ? `${listing.id}@${listing.version ?? ""}?${new URLSearchParams(previewQuery(choice))}#${attempt}`
      : null;
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

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return {
    outcome: answer?.outcome ?? null,
    updating: key != null && answer?.key !== key,
    retry,
  };
}
