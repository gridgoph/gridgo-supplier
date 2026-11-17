/**
 * The Leaflet document the shop pins its own location in.
 *
 * One map, one pin, and nothing else — the point GRIDGO measures delivery
 * distance from, so the document deliberately cannot draw a second marker, a
 * route, or a service area. The rider on the way to the shop is a separate,
 * watch-only document (`lib/approachMapHtml.ts`).
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
  /** What the pin currently reads as. Its tooltip; the screen states it in full. */
  label: string;
  /** Recentre and zoom to the pin. Set when a search result moves it. */
  recentre: boolean;
  /**
   * How close to come in when recentring. A door wants `PIN_ZOOM`; the middle
   * of a barangay is shown wider, so the shop can see where to drag from.
   */
  zoom?: number;
  /**
   * The phone's own error radius, in metres, for a pin Use my location set.
   * Drawn as a faint circle so a rough fix reads as "somewhere in here", not
   * as the shop's door. Null for a searched or hand-placed pin; the document
   * also drops it the moment the shop taps or drags.
   */
  accuracyMeters?: number | null;
};

/** What the document sends back. Anything else is ignored by the host. */
export type ShopMapEvent =
  | { type: "ready" }
  /** A finger (or mouse) has picked the pin up. Sent before any move ends. */
  | { type: "grab" }
  | { type: "pin"; lat: number; lng: number };

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Davao City centre — where a shop that has placed nothing starts looking. */
export const DAVAO_CENTRE: LatLng = { lat: 7.0731, lng: 125.6128 };

/** Close enough to see which building the pin's tip is on, and its gate. */
export const PIN_ZOOM = 18;

/**
 * Below this, a tap lands somewhere in a block rather than on a door, so the
 * map comes in to `PIN_ZOOM` on the new pin for the shop to drag it the rest
 * of the way.
 */
export const CLOSE_ENOUGH_ZOOM = 17;

/** Above this radius the map shows the whole circle rather than the door. */
export const WIDE_FIX_METERS = 40;

/** Accuracy circle colours: the `info` token, light and dark. */
const ACCURACY_LIGHT = "#1565C0";
const ACCURACY_DARK = "#42A5F5";

export function parseShopMapEvent(raw: string): ShopMapEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return null;
    const value = parsed as Record<string, unknown>;
    if (value.type === "ready") return { type: "ready" };
    if (value.type === "grab") return { type: "grab" };
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
    /* Leaflet's zoom buttons are white plates; at night they glared. */
    body.night .leaflet-bar a, body.night .leaflet-bar a:hover {
      background: #141414; color: #f0f0f0; border-bottom-color: #2e2e2e;
    }
    body.night .leaflet-bar { border-color: #2e2e2e; }
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
    /* The point itself, so the shop can see exactly what the tip is on. */
    .pin-shop .pin-dot {
      width: 8px; height: 8px; border-radius: 999px; background: #1a1a1a;
    }
    /*
      Picked up: the head lifts off the point so the finger can see the tip and
      the street under it. Put down, it settles back onto the point.
    */
    .pin-head, .pin-tip { transition: transform 160ms ease-out, opacity 160ms ease-out; }
    .is-lifted .pin-head { transform: translateY(-14px); }
    .is-lifted .pin-tip { transform: translateY(-7px) rotate(45deg) scale(0.7); opacity: 0.6; }
    @media (prefers-reduced-motion: reduce) {
      .pin-head, .pin-tip { transition: none; }
    }
    /* Clear of the zoom buttons on the right, which it used to run under. */
    .hint {
      position: absolute; bottom: 28px; left: 8px; right: 56px; z-index: 1000;
      padding: 8px 12px; border-radius: 12px; text-align: center;
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
  <div id="hint" class="hint">Tap your shop on the map</div>
  <div id="map"></div>
  <script>
    var MODEL = ${safe};
    var map = null;
    var tileLayer = null;
    var tileTheme = null;
    var marker = null;
    var accuracyLayer = null;
    // True while the shop holds the pin. A model pushed meanwhile (a late
    // phone fix, say) must not move the pin out from under the finger.
    var dragging = false;
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

    // No caption on the tiles: the address is stated in full under the map,
    // and a caption here covered the very street the shop was aiming for.
    function pinIcon() {
      return L.divIcon({
        className: '',
        html: '<div class="pin pin-shop is-selected">'
          + '<div class="pin-head"><div class="pin-dot"></div></div>'
          + '<div class="pin-tip"></div>'
          + '</div>',
        iconSize: [40, 48],
        // The tip sits on the point.
        iconAnchor: [20, 40]
      });
    }

    function lookAt(lat, lng, zoom) {
      map.setView([lat, lng], zoom, { animate: !reduceMotion });
    }

    function clearAccuracy() {
      if (accuracyLayer) { map.removeLayer(accuracyLayer); accuracyLayer = null; }
      MODEL.accuracyMeters = null;
    }

    // The phone's error circle round a Use-my-location pin. Not interactive:
    // a tap inside it is still a tap on the map.
    function drawAccuracy(m) {
      if (accuracyLayer) { map.removeLayer(accuracyLayer); accuracyLayer = null; }
      if (!m.pin || !(m.accuracyMeters > 0)) return;
      var tint = m.theme === 'dark' ? '${ACCURACY_DARK}' : '${ACCURACY_LIGHT}';
      accuracyLayer = L.circle([m.pin.lat, m.pin.lng], {
        radius: m.accuracyMeters,
        color: tint, weight: 1, opacity: 0.6,
        fillColor: tint, fillOpacity: 0.12,
        interactive: false
      }).addTo(map);
    }

    function place(lat, lng, announce) {
      if (!marker) {
        marker = L.marker([lat, lng], {
          draggable: true,
          autoPan: true,
          icon: pinIcon(),
          keyboard: false,
          title: MODEL.label || 'Your shop'
        }).addTo(map);
        marker.on('dragstart', function () {
          var el = marker.getElement();
          if (el) el.classList.add('is-lifted');
          dragging = true;
          // Picked up by hand: the phone's circle no longer describes it,
          // and a fix still on its way is for nobody. Said now, not at the
          // drop, so the host can drop that fix before it lands.
          clearAccuracy();
          send({ type: 'grab' });
        });
        marker.on('dragend', function () {
          var el = marker.getElement();
          if (el) el.classList.remove('is-lifted');
          dragging = false;
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
        map.setView([${DAVAO_CENTRE.lat}, ${DAVAO_CENTRE.lng}], 13);
        map.on('click', function (e) {
          clearAccuracy();
          place(e.latlng.lat, e.latlng.lng, true);
          // A tap from across the city lands on a block, not a door: come in
          // on it so the last few metres are a drag, not a guess.
          if (map.getZoom() < ${CLOSE_ENOUGH_ZOOM}) lookAt(e.latlng.lat, e.latlng.lng, ${PIN_ZOOM});
        });
      }

      // Tiles are swapped only when the theme changes; every pin move used to
      // reload them under the shop's thumb.
      if (tileTheme !== m.theme) {
      if (tileLayer) map.removeLayer(tileLayer);
      tileTheme = m.theme;
      tileLayer = L.tileLayer(
        night ? ${JSON.stringify(cartoDarkTileUrl())} : ${JSON.stringify(LIGHT_TILES)},
        {
          maxZoom: 19,
          attribution: night
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      ).addTo(map);
      }

      // Mid-drag the hand owns the pin: theme and tiles may change, the pin,
      // its circle and the view may not.
      if (dragging) return;
      drawAccuracy(m);
      if (m.pin) {
        place(m.pin.lat, m.pin.lng, false);
        if (marker && marker.getElement()) marker.getElement().title = m.label || 'Your shop';
        if (m.recentre) {
          if (accuracyLayer && m.accuracyMeters > ${WIDE_FIX_METERS}) {
            // A rough fix shows its whole circle, so the shop sees how far
            // off it may be. From the point itself: a circle's own getBounds
            // needs a map that already has a view.
            var reach = L.latLng(m.pin.lat, m.pin.lng).toBounds(m.accuracyMeters * 2);
            map.fitBounds(reach, { padding: [24, 24], maxZoom: ${PIN_ZOOM}, animate: !reduceMotion });
          } else {
            lookAt(m.pin.lat, m.pin.lng, m.zoom || ${PIN_ZOOM});
          }
        }
      }
    }

    applyModel(MODEL);
    send({ type: 'ready' });

    document.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
    window.addEventListener('message', function (e) {
      // In a browser frame, only the page that drew this map may redraw it.
      if (window.parent !== window && e.source !== window.parent) return;
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
  </script>
</body>
</html>`;
}
