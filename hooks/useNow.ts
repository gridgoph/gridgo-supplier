import { useEffect, useState } from "react";

/**
 * The current time, redrawn every `intervalMs`. Null stops the clock, so a
 * screen with nothing counting down does not re-render for nothing.
 */
export function useNow(intervalMs: number | null): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!intervalMs) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
