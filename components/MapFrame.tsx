import { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";

import { parseShopMapEvent, type ShopMapEvent } from "@/lib/mapHtml";
import { useThemeColors } from "@/hooks/useTheme";

export type MapFrameHandle = {
  /** Push a new model into the already-loaded map document. */
  post: (json: string) => void;
};

type Props = {
  /** The whole Leaflet document, built by `lib/mapHtml.ts`. */
  html: string;
  /** Fired once the document is ready to receive a model. */
  onReady: () => void;
  /** Fired when a person moves the pin inside the document. */
  onEvent: (event: ShopMapEvent) => void;
  accessibilityLabel: string;
};

/**
 * The container the Leaflet map lives in.
 *
 * Split from the picker for the same reason the rider app splits it:
 * `react-native-webview` has no web implementation and renders a red error
 * string there, which would turn the map on this app's only screenshottable
 * target into a failure notice. The web file next to this one draws the same
 * document in an iframe — same tiles, same pin, same messages.
 */
export const MapFrame = forwardRef<MapFrameHandle, Props>(function MapFrame(
  { html, onReady, onEvent, accessibilityLabel },
  ref,
) {
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    post: (json: string) => {
      webRef.current?.injectJavaScript(`try { applyModel(${json}); } catch (e) {} true;`);
    },
  }));

  return (
    <WebView
      ref={webRef}
      originWhitelist={["*"]}
      source={{ html, baseUrl: "https://localhost" }}
      onLoadEnd={onReady}
      // Setting this is what injects `window.ReactNativeWebView.postMessage`
      // into the document, so the pin can travel back out.
      onMessage={(event) => {
        const parsed = parseShopMapEvent(event.nativeEvent.data);
        if (parsed) onEvent(parsed);
      }}
      style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
      nestedScrollEnabled
      scrollEnabled={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      javaScriptEnabled
      domStorageEnabled
      // Allow the Leaflet CDN and the tile hosts.
      mixedContentMode="compatibility"
      // Keep an Android hardware layer for smoother pan.
      androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
      accessibilityLabel={accessibilityLabel}
    />
  );
});
