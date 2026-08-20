import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export type CatalogueView = "wall" | "list";

const STORAGE_KEY = "gridgo.catalogueView";

/**
 * How the shop wants its board drawn: a wall of samples, or a list of quotes.
 *
 * Default is the wall — that is how a print shop looks at its own work. The
 * choice is remembered on this phone so flipping the tab does not reset it.
 */
export function useCatalogueView(): [CatalogueView, (next: CatalogueView) => void] {
  const [view, setView] = useState<CatalogueView>("wall");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "wall" || stored === "list") setView(stored);
      })
      .catch(() => {
        // Keep the wall. A failed read must not invent a list.
      });
  }, []);

  function choose(next: CatalogueView) {
    setView(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // In-memory choice still applies for this visit.
    });
  }

  return [view, choose];
}
