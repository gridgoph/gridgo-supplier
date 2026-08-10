import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { MapFrameHandle } from "@/components/MapFrame";
import { parseShopMapEvent, type ShopMapEvent } from "@/lib/mapHtml";

type Props = {
  html: string;
  onReady: () => void;
  onEvent: (event: ShopMapEvent) => void;
  accessibilityLabel: string;
};

/**
 * The same Leaflet document, in an iframe, for Expo web.
 *
 * The document already speaks `window.postMessage` in both directions, so the
 * model goes in the same way it does on a phone and the pin comes back on the
 * window's own message channel.
 */
export const MapFrame = forwardRef<MapFrameHandle, Props>(function MapFrame(
  { html, onReady, onEvent, accessibilityLabel },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useImperativeHandle(ref, () => ({
    post: (json: string) => {
      frameRef.current?.contentWindow?.postMessage(json, "*");
    },
  }));

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const parsed = parseShopMapEvent(event.data);
      if (parsed) onEvent(parsed);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onEvent]);

  return createElement("iframe", {
    ref: frameRef,
    srcDoc: html,
    onLoad: onReady,
    title: accessibilityLabel,
    style: { border: "none", width: "100%", height: "100%", display: "block" },
  });
});
