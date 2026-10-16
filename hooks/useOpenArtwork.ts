import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";

import { getDownloadUrl } from "@/lib/api";

/**
 * Open one of the job's stored files at full size, where the shop can look
 * at it, save it or print it. A fresh link is read for every open: one held
 * on screen may be minutes old, and storage honours a link for five.
 */
export function useOpenArtwork(fileId: string) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const openingRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function open() {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setOpenError(null);
    try {
      const link = await getDownloadUrl(fileId);
      if (mounted.current) await WebBrowser.openBrowserAsync(link.url);
    } catch {
      if (mounted.current) setOpenError("The file could not open. Check your connection and try again.");
    } finally {
      openingRef.current = false;
      if (mounted.current) setOpening(false);
    }
  }

  return { open, opening, openError, clearOpenError: () => setOpenError(null) };
}
