import { useEffect } from "react";
import { AppState } from "react-native";

import { systemPickerOpen } from "@/lib/sharedDevice";
import { BACKGROUND_LOCK_MS, useShopWorker } from "@/store/shopWorker";

/**
 * A shared shop phone that goes to the background hands itself back at once
 * (gridgo-api `docs/SHOP_TEAM_API.md`: lock on handover and background).
 *
 * The one exception is a camera, gallery or file picker this app opened
 * itself (`withSystemPicker`): it sends the app to the background for a few
 * seconds while the worker photographs their work, and locking then would
 * throw them out of the step they were finishing. Even that trip locks on
 * the way back if it ran past two minutes — a phone left on the camera is a
 * phone put down. GRIDGO's own 30 minutes still apply on top.
 */
export function useWorkerAutoLock(): void {
  useEffect(() => {
    // Every trip away is recorded, worker or not: a pick that finishes while
    // the app is already in the background must still lock on the way back.
    let away: { at: number; picker: boolean } | null = null;
    const subscription = AppState.addEventListener("change", (next) => {
      const shop = useShopWorker.getState();
      if (next === "background") {
        const picker = systemPickerOpen();
        away = { at: Date.now(), picker };
        if (shop.worker && !picker) void shop.lock();
        return;
      }
      if (next !== "active") return;
      const trip = away;
      away = null;
      if (!trip || !useShopWorker.getState().worker) return;
      const shortPickerTrip = trip.picker && Date.now() - trip.at < BACKGROUND_LOCK_MS;
      if (!shortPickerTrip) void useShopWorker.getState().lock();
    });
    return () => subscription.remove();
  }, []);
}
