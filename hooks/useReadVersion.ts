import { useCallback, useEffect, useRef } from "react";
import { liveGeneration } from "@/lib/live";
/** Only the newest read for this mounted screen/account may adopt a result. */
export function useReadVersion() {
  const version = useRef(0);
  useEffect(() => () => { ++version.current; }, []);
  return useCallback(() => {
    const ticket = ++version.current;
    const generation = liveGeneration();
    return () => ticket === version.current && generation === liveGeneration();
  }, []);
}
