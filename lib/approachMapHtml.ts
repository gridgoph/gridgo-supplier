/**
 * The Leaflet document for a rider on the way to the shop (gridgo-supplier#148).
 *
 * Two points and the road between them: the shop's own pin, the rider's last
 * position, and the route as a yellow line — the one place the design system
 * lets a map spend yellow. The line sits on a dark casing so it still reads on
 * OpenStreetMap's pale streets. Nothing else is drawn: no client, no drop-off,
 * because the shop's view of a job ends at its own counter.
 *
 * It is a separate document from `lib/mapHtml.ts` on purpose. That one is the
 * shop placing its own pin and is built to hold exactly one draggable marker;
 * this one is watch-only, and a shop tapping it moves nothing.
 *
 * Same stack as the rest of the fleet: Leaflet 1.9.4 pinned by integrity hash,
 * OpenStreetMap tiles in Light, CARTO dark in Dark, attribution always shown.
 * The host pushes a model with `applyModel`, through `components/MapFrame`,
 * once the document has said `{ type: "ready" }`.
 */

import { cartoDarkTileUrl } from "@/lib/cartoTiles";
import { DAVAO_CENTRE } from "@/lib/mapHtml";
import type { GeoPoint, LonLat } from "@/lib/riderApproach";

export type ApproachMapModel = {
  theme: "light" | "dark";
  shop: GeoPoint | null;
  rider: GeoPoint | null;
  /** The rider's first name, written under their dot. */
  riderLabel: string;
  /** Faded rider and line: the position is old. The card says so in words. */
  faded: boolean;
  route: LonLat[];
  colors: {
    route: string;
    casing: string;
    rider: string;
    shopFill: string;
    shopInk: string;
  };
};

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export function buildApproachMapHtml(model: ApproachMapModel): string {
  const safe = JSON.stringify(model).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
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
    .leaflet-div-icon { background: transparent; border: 0; }
    .shop { width: 34px; height: 48px; position: relative; }
    .shop svg { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.30)); }
    body.night .shop svg {
      filter: drop-shadow(0 0 1.5px rgba(255,255,255,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.6));
    }
    .rider { position: relative; width: 22px; height: 22px; }
    .rider .dot {
      position: absolute; left: 3px; top: 3px;
      width: 16px; height: 16px; border-radius: 999px;
      border: 3px solid #ffffff; box-sizing: border-box;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }
    /* The one motion on the map: a live position breathes, an old one does not. */
    .rider .halo {
      position: absolute; left: 0; top: 0;
      width: 22px; height: 22px; border-radius: 999px; opacity: 0.35;
      animation: breathe 2s ease-out infinite;
    }
    /* An old fix fades the dot, never the name: the name still says whose it was. */
    .rider.faded .dot { opacity: 0.4; }
    .rider.faded .halo { display: none; }
    @keyframes breathe {
      from { transform: scale(0.8); opacity: 0.45; }
      to { transform: scale(2.2); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) { .rider .halo { animation: none; display: none; } }
    .name {
      position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
      padding: 2px 6px; border-radius: 6px; white-space: nowrap;
      font: 700 10px/1.25 system-ui, -apple-system, sans-serif;
      background: rgba(255,255,255,0.96); color: #1a1a1a;
      border: 1px solid rgba(0,0,0,0.08);
      max-width: 120px; overflow: hidden; text-overflow: ellipsis;
    }
    body.night .name { background: rgba(18,18,18,0.94); color: #f0f0f0; border-color: rgba(255,255,255,0.14); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var MODEL = ${safe};
    var map = null;
    var tiles = null;
    var casing = null;
    var line = null;
    var shopMarker = null;
    var riderMarker = null;
    // Once a person pans or zooms, the map stops refitting itself under them.
    var steered = false;
    var PIN = 'M17 45.6C17 45.6 3.2 27.9 3.2 17.6A13.8 13.8 0 1 1 30.8 17.6C30.8 27.9 17 45.6 17 45.6Z';
    var STORE = 'M11 15.5h12l-1-3.5H12zM12 15.5v7h10v-7M15.5 22.5v-3.5h3v3.5';

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function shopIcon(c) {
      return L.divIcon({
        className: '',
        html: '<div class="shop"><svg width="34" height="48" viewBox="0 0 34 48">'
          + '<path d="' + PIN + '" fill="' + c.shopFill + '" stroke="' + c.shopInk + '" stroke-width="2" stroke-linejoin="round"/>'
          + '<path d="' + STORE + '" fill="none" stroke="' + c.shopInk + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'
          + '</svg></div>',
        iconSize: [34, 48],
        iconAnchor: [17, 45]
      });
    }

    function riderIcon(m) {
      var name = m.riderLabel ? '<div class="name">' + escapeHtml(m.riderLabel) + '</div>' : '';
      return L.divIcon({
        className: '',
        html: '<div class="rider' + (m.faded ? ' faded' : '') + '">'
          + '<div class="halo" style="background:' + m.colors.rider + '"></div>'
          + '<div class="dot" style="background:' + m.colors.rider + '"></div>'
          + name + '</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
    }

    function applyModel(m) {
      MODEL = m;
      var night = m.theme === 'dark';
      document.body.className = night ? 'night' : '';

      if (!map) {
        map = L.map('map', { zoomControl: false, attributionControl: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        map.setView([${DAVAO_CENTRE.lat}, ${DAVAO_CENTRE.lng}], 13);
        map.on('dragstart', function () { steered = true; });
        map.on('zoomstart', function (e) { if (e && e.originalEvent) steered = true; });
        map.getContainer().addEventListener('wheel', function () { steered = true; });
        map.getContainer().addEventListener('touchstart', function (e) {
          if (e.touches && e.touches.length > 1) steered = true;
        });
      }

      var url = night ? ${JSON.stringify(cartoDarkTileUrl())} : ${JSON.stringify(LIGHT_TILES)};
      if (!tiles || tiles._url !== url) {
        if (tiles) map.removeLayer(tiles);
        tiles = L.tileLayer(url, {
          maxZoom: 19,
          attribution: night
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
      }

      if (casing) map.removeLayer(casing);
      if (line) map.removeLayer(line);
      casing = null;
      line = null;
      if (m.route && m.route.length >= 2) {
        var latlngs = m.route.map(function (c) { return [c[1], c[0]]; });
        var opacity = m.faded ? 0.45 : 1;
        casing = L.polyline(latlngs, { color: m.colors.casing, weight: 9, opacity: opacity, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        line = L.polyline(latlngs, { color: m.colors.route, weight: 5, opacity: opacity, lineJoin: 'round', lineCap: 'round' }).addTo(map);
      }

      if (m.shop) {
        if (!shopMarker) shopMarker = L.marker([m.shop.lat, m.shop.lng], { icon: shopIcon(m.colors), keyboard: false, title: 'Your shop', zIndexOffset: 100 }).addTo(map);
        else { shopMarker.setLatLng([m.shop.lat, m.shop.lng]); shopMarker.setIcon(shopIcon(m.colors)); }
      } else if (shopMarker) { map.removeLayer(shopMarker); shopMarker = null; }

      if (m.rider) {
        if (!riderMarker) riderMarker = L.marker([m.rider.lat, m.rider.lng], { icon: riderIcon(m), keyboard: false, title: 'Rider', zIndexOffset: 200 }).addTo(map);
        else { riderMarker.setLatLng([m.rider.lat, m.rider.lng]); riderMarker.setIcon(riderIcon(m)); }
      } else if (riderMarker) { map.removeLayer(riderMarker); riderMarker = null; }

      if (steered) return;
      var bounds = [];
      if (m.shop) bounds.push([m.shop.lat, m.shop.lng]);
      if (m.rider) bounds.push([m.rider.lat, m.rider.lng]);
      if (line) {
        try { map.fitBounds(line.getBounds().pad(0.2), { maxZoom: 17 }); return; } catch (e) {}
      }
      if (bounds.length >= 2) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      else if (bounds.length === 1) map.setView(bounds[0], 15);
    }

    function send(payload) {
      var text = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(text);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(text, '*');
      }
    }

    applyModel(MODEL);
    // Ready as soon as a model can be applied — not when every tile has loaded,
    // which on a slow line is long after the rider has moved.
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
