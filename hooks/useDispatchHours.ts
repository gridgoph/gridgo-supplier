import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";
import { dispatchClosedLine, readDispatchHours, type DispatchHours } from "@/lib/dispatchHours";
import { useReadVersion } from "@/hooks/useReadVersion";

/** Dispatch can close while a job sits open on screen. */
const REREAD_MS = 5 * 60_000;

/**
 * The last answer, kept across screens so the job's screen is right as it opens
 * after marking ready, rather than a moment later.
 */
let known: DispatchHours | null = null;

/**
 * Whether dispatch is closed right now, for a screen about a job waiting for a
 * rider. Reads `GET /settings` on focus and again at the opening itself, so the
 * line goes away when riders can see the job. A failed read shows nothing new.
 *
 * `refresh` resolves to the line as of that read, for a caller about to say it.
 */
export function useDispatchHours(enabled: boolean): {
  closedLine: string | null;
  refresh: () => Promise<string | null>;
} {
  const [hours, setHours] = useState(known);
  const [readAt, setReadAt] = useState(0);
  const beginRead = useReadVersion();

  const refresh = useCallback(async () => {
    const isCurrent = beginRead();
    try {
      known = readDispatchHours(await api.getOperatingStatus());
      if (isCurrent()) setHours(known);
    } catch {
      // What was last known stands.
    }
    if (isCurrent()) setReadAt(Date.now());
    return dispatchClosedLine(known, new Date());
  }, [beginRead]);

  useFocusEffect(
    useCallback(() => {
      if (enabled) void refresh();
    }, [enabled, refresh]),
  );

  useEffect(() => {
    if (!enabled || !readAt) return;
    const opening = hours?.isOpenNow === false && hours.nextOpenAt ? Date.parse(hours.nextOpenAt) : Infinity;
    const wait = Math.max(1000, Math.min(REREAD_MS, opening - Date.now()));
    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
  }, [enabled, hours, readAt, refresh]);

  return { closedLine: enabled ? dispatchClosedLine(hours, new Date()) : null, refresh };
}
