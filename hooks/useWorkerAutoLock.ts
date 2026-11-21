import { useEffect } from "react";
import { AppState } from "react-native";

import { BACKGROUND_LOCK_MS, useShopWorker } from "@/store/shopWorker";

/**
 * A shared shop phone that sat in the background hands itself back.
 *
 * GRIDGO asks for a lock on handover and background. Not on every trip to the
 * background, though: the camera that takes a production photo sends the app
 * there for a few seconds, and locking then would throw the worker out of the
 * step they were finishing. Two minutes away is a phone put down, so on the
 * way back it goes to the picker. GRIDGO's own 30 minutes still apply on top.
 */
export function useWorkerAutoLock(): void {
  useEffect(() => {
    let awayAt: number | null = null;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        awayAt = Date.now();
        return;
      }
      if (next !== "active") return;
      const away = awayAt == null ? 0 : Date.now() - awayAt;
      awayAt = null;
      if (away >= BACKGROUND_LOCK_MS && useShopWorker.getState().worker) void useShopWorker.getState().lock();
    });
    return () => subscription.remove();
  }, []);
}
