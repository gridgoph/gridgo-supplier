/**
 * The Leaflet document the shop pins its own location in.
 *
 * One map, one pin, and nothing else — this app's only use of a map is the
 * point GRIDGO measures delivery distance from, so the document deliberately
 * cannot draw a second marker, a route, or a service area.
 *
 * Tiles are OpenStreetMap (light) and Carto dark (night), the same stack the
 * rider app ships. Attribution is a licence condition and is always visible.
 * There is no Google here. Dark Carto tiles take `EXPO_PUBLIC_CARTO_API_KEY`
 * from gitignored env, the same token Rider and Client use.
 *
 * The host pushes a model in (`applyModel`) and the document posts the pin back
 * out whenever a person moves it. Both directions use the same JSON string on
 * `window.postMessage` / `ReactNativeWebView.postMessage`, so the web fallback
 * in `MapFrame.web.tsx` needs no second implementation.
 */

import { cartoDarkTileUrl } from "@/lib/cartoTiles";

export type MapTheme = "light" | "dark";

export type LatLng = { lat: number; lng: number };

export type ShopMapModel = {
  theme: MapTheme;
  /** Null before a shop has placed anything; the map then sits over Davao. */
  pin: LatLng | null;
  /** What the pin currently reads as. Drawn under the marker. */
  label: string;
  /** Recentre and zoom to the pin. Set when a search result moves it. */
  recentre: boolean;
};

/** What the document sends back. Anything else is ignored by the host. */
export type ShopMapEvent =
  | { type: "ready" }
  | { type: "pin"; lat: number; lng: number };

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Davao City centre — where a shop that has placed nothing starts looking. */
export const DAVAO_CENTRE: LatLng = { lat: 7.0731, lng: 125.6128 };

export function parseShopMapEvent(raw: string): ShopMapEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return null;
    const value = parsed as Record<string, unknown>;
    if (value.type === "ready") return { type: "ready" };
    if (value.type === "pin" && typeof value.lat === "number" && typeof value.lng === "number") {
      return { type: "pin", lat: value.lat, lng: value.lng };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The full document. Leaflet loads from unpkg, on the same connectivity bar as
 * the tiles themselves — a phone that cannot reach one cannot reach the other,
 * and the screen says so rather than showing an empty grey box.
 */
export function buildShopMapHtml(model: ShopMapModel): string {
  const safe = JSON.stringify(model).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <!--
    Subresource integrity is Leaflet 1.9.4's own published hash. A CDN that
    served anything else would be running code inside a document this app hands
    a shop's own address to, so the bytes are pinned rather than trusted.
  -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
    crossorigin="anonymous" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
    crossorigin="anonymous"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #f0f0f0; }
    body.night, body.night #map { background: #1e1e1e; }
    .leaflet-control-attribution {
      font-size: 10px !important;
      background: rgba(255,255,255,0.85) !important;
      color: #1a1a1a !important;
      max-width: 72%;
    }
    body.night .leaflet-control-attribution {
      background: rgba(20,20,20,0.9) !important;
      color: #f0f0f0 !important;
    }
    /* Leaflet's default div-icon is a white plate. The shop pin is a teardrop
       — same head + tip the rider Maps tab draws — so the two apps read as
       one city. */
    .leaflet-div-icon { background: transparent; border: none; }
    .pin {
      display: flex; flex-direction: column; align-items: center;
      transform: translateY(-4px);
    }
    .pin-shop .pin-head {
      width: 30px; height: 30px; border-radius: 999px;
      background: #FFDE58; color: #1a1a1a;
      border: 2px solid #1a1a1a;
      display: flex; align-items: center; justify-content: center;
      font: 700 12px/1 system-ui, sans-serif;
      position: relative; z-index: 1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }
    .pin-shop .pin-tip {
      width: 12px; height: 12px;
      background: #FFDE58;
      border-right: 2px solid #1a1a1a;
      border-bottom: 2px solid #1a1a1a;
      transform: translateY(-7px) rotate(45deg);
    }
    .pin-shop.is-selected .pin-head {
      box-shadow: 0 0 0 3px #ffffff, 0 1px 3px rgba(0,0,0,0.35);
    }
    .pin-label {
      margin-top: 2px; padding: 1px 4px;
      font: 600 9px/1.2 system-ui, sans-serif;
      background: rgba(255,255,255,0.92); color: #1a1a1a;
      border-radius: 3px; white-space: nowrap;
      max-width: 160px; overflow: hidden; text-overflow: ellipsis;
    }
    body.night .pin-label { background: rgba(20,20,20,0.92); color: #f0f0f0; }
    .hint {
      position: absolute; bottom: 28px; left: 8px; right: 8px; z-index: 1000;
      padding: 6px 10px; border-radius: 8px; text-align: center;
      font: 600 12px/1.3 system-ui, sans-serif;
      background: rgba(255,255,255,0.95); color: #1a1a1a;
      border: 1px solid #dcdcdc;
    }
    body.night .hint {
      background: rgba(20,20,20,0.95); color: #f0f0f0; border-color: #2e2e2e;
    }
    .hint.gone { display: none; }
  </style>
</head>
<body>
  <div id="hint" class="hint">Tap the map to place your shop, or drag the pin</div>
  <div id="map"></div>
  <script>
    var MODEL = ${safe};
    var map = null;
    var tileLayer = null;
    var marker = null;

    function send(payload) {
      var text = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(text);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(text, '*');
      }
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function pinIcon(label) {
      var text = String(label || '').replace(/^\s+/, '');
      var letter = text ? escapeHtml(text.charAt(0).toUpperCase()) : '';
      var labelHtml = text
        ? '<div class="pin-label">' + escapeHtml(text) + '</div>'
        : '';
      return L.divIcon({
        className: '',
        html: '<div class="pin pin-shop is-selected">'
          + '<div class="pin-head">' + letter + '</div>'
          + '<div class="pin-tip"></div>'
          + labelHtml
          + '</div>',
        // Wide enough for the caption; the tip still sits on the point.
        iconSize: [168, 72],
        iconAnchor: [84, 40]
      });
    }

    function place(lat, lng, announce) {
      if (!marker) {
        marker = L.marker([lat, lng], {
          draggable: true,
          icon: pinIcon(MODEL.label),
          keyboard: false,
          title: 'Your shop'
        }).addTo(map);
        marker.on('dragend', function () {
          var p = marker.getLatLng();
          send({ type: 'pin', lat: p.lat, lng: p.lng });
        });
      } else {
        marker.setLatLng([lat, lng]);
      }
      document.getElementById('hint').className = 'hint gone';
      if (announce) send({ type: 'pin', lat: lat, lng: lng });
    }

    function applyModel(m) {
      MODEL = m;
      var night = m.theme === 'dark';
      document.body.className = night ? 'night' : '';

      if (!map) {
        map = L.map('map', { zoomControl: false, attributionControl: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        map.setView([${DAVAO_CENTRE.lat}, ${DAVAO_CENTRE.lng}], 12);
        map.on('click', function (e) {
          place(e.latlng.lat, e.latlng.lng, true);
        });
      }

      if (tileLayer) map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(
        night ? ${JSON.stringify(cartoDarkTileUrl())} : ${JSON.stringify(LIGHT_TILES)},
        {
          maxZoom: 19,
          attribution: night
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      ).addTo(map);

      if (m.pin) {
        place(m.pin.lat, m.pin.lng, false);
        if (marker) marker.setIcon(pinIcon(m.label));
        if (m.recentre) map.setView([m.pin.lat, m.pin.lng], 16);
      }
    }

    applyModel(MODEL);
    send({ type: 'ready' });

    document.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
    window.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
  </script>
</body>
</html>`;
}
