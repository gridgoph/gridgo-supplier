import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { Listing } from "@/lib/listings";
import { loadListing } from "@/lib/listingsApi";
import { loadTemplateCatalogue } from "@/lib/productTemplatesApi";

export type CheckProducts = {
  /** Products waiting on the shop: a price to add, or GRIDGO-prepared prices to confirm. */
  items: Listing[];
  /** Tidy-ups the GRIDGO team has lined up (matches, duplicates). Theirs to run, not the shop's. */
  suggested: number;
};

/** At most this many products are read one by one. */
const MAX_READS = 30;

/**
 * What "Check your products" is about (gridgo-supplier#268).
 *
 * Null until GRIDGO answers, and null for good on a GRIDGO without templates:
 * the card is drawn only when there is something real for the shop to do, so a
 * production build before the API release shows nothing at all.
 */
export function useCheckProducts(): { check: CheckProducts | null; reload: () => Promise<void> } {
  const [check, setCheck] = useState<CheckProducts | null>(null);

  const reload = useCallback(async () => {
    const catalogue = await loadTemplateCatalogue();
    if (catalogue.status !== "ok") {
      setCheck(null);
      return;
    }
    // The board list does not carry `template`, so the products to read are the
    // ones GRIDGO names: each template's own products, and the unpriced ones.
    const ids = [
      ...new Set([
        ...catalogue.value.check.unpricedItemIds,
        ...catalogue.value.templates.flatMap((t) => t.addedItemIds),
      ]),
    ].slice(0, MAX_READS);
    const owes = (l: Listing) =>
      l.template != null && (l.template.needsPrice || !l.template.shopConfirmed) && !l.template.mergedInto;
    const items: Listing[] = [];
    for (const result of await Promise.all(ids.map((id) => loadListing(id)))) {
      if (result.status === "ok" && owes(result.value)) items.push(result.value);
    }
    setCheck({ items, suggested: catalogue.value.check.suggestedCount });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { check, reload };
}
