import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import { requestCurrentLocation } from "@/lib/deviceLocation";
import { useHomePrinter } from "@/store/homePrinter";

/** At most one fix this often: enough to notice leaving home, not a tracker. */
export const HOME_FIX_INTERVAL_MS = 2 * 60 * 1000;

/**
 * While a home printer is online, send GRIDGO a current position when To do
 * comes into view and when the app comes back to the foreground
 * (gridgo-api#412 §7). GRIDGO decides from it whether offers pause; the phone
 * never compares distances itself. Quiet: a failed fix keeps the last one.
 */
export function useHomeLocationFixes(enabled: boolean) {
  const last = useRef(0);

  const send = useCallback(async () => {
    const home = useHomePrinter.getState().home;
    if (!enabled || !home || !home.status.online) return;
    if (Date.now() - last.current < HOME_FIX_INTERVAL_MS) return;
    last.current = Date.now();
    const fix = await requestCurrentLocation();
    if (fix.status !== "ok") return;
    await useHomePrinter.getState().update({ location: fix.point }, "update your location");
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      void send();
    }, [send]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void send();
    });
    return () => subscription.remove();
  }, [send]);
}
