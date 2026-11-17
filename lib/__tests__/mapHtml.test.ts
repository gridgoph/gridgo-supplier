import { buildShopMapHtml, CLOSE_ENOUGH_ZOOM, DAVAO_CENTRE, parseShopMapEvent, PIN_ZOOM } from "@/lib/mapHtml";

const MODEL = {
  theme: "light" as const,
  pin: { lat: 7.0644, lng: 125.6085 },
  label: "C.M. Recto St",
  recentre: false,
};

describe("the map document", () => {
  /** Settled fleet-wide, and reverted once already. */
  it("uses OpenStreetMap and no Google, with no key anywhere in it", () => {
    const html = buildShopMapHtml(MODEL);
    expect(html).toContain("tile.openstreetmap.org");
    expect(html.toLowerCase()).not.toContain("google");
    expect(html.toLowerCase()).not.toContain("apikey");
    expect(html.toLowerCase()).not.toContain("access_token");
  });

  /** Attribution is a licence condition, not a courtesy. */
  it("always shows OpenStreetMap attribution, in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const html = buildShopMapHtml({ ...MODEL, theme });
      expect(html).toContain("openstreetmap.org/copyright");
    }
    expect(buildShopMapHtml({ ...MODEL, theme: "dark" })).toContain("carto.com/attributions");
  });

  it("pins the CDN bytes it runs", () => {
    const html = buildShopMapHtml(MODEL);
    expect(html).toMatch(/leaflet\.js"\s+integrity="sha384-/);
    expect(html).toMatch(/leaflet\.css"\s+integrity="sha384-/);
  });

  it("starts over Davao when no pin has been placed", () => {
    const html = buildShopMapHtml({ ...MODEL, pin: null });
    expect(html).toContain(String(DAVAO_CENTRE.lat));
    expect(html).toContain(String(DAVAO_CENTRE.lng));
  });

  it("cannot be broken by a label carrying markup", () => {
    const html = buildShopMapHtml({ ...MODEL, label: '</script><script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("\\u003c");
  });

  it("draws the rider Maps teardrop, not a square plate", () => {
    const html = buildShopMapHtml(MODEL);
    expect(html).toContain("pin-shop");
    expect(html).toContain("pin-head");
    expect(html).toContain("pin-tip");
    expect(html).toContain("is-selected");
    expect(html).not.toContain("shop-pin-mark");
  });

  /**
   * The address is stated in full under the map. A caption on the tiles
   * covered the street the shop was aiming at, and the head's letter was the
   * first character of whatever the address read ("1" for a road code).
   */
  it("puts no caption or letter on the pin", () => {
    const html = buildShopMapHtml(MODEL);
    expect(html).not.toContain("pin-label");
    expect(html).not.toContain("charAt(0)");
  });

  it("lifts the pin off its point while it is dragged, unless motion is reduced", () => {
    const html = buildShopMapHtml(MODEL);
    expect(html).toContain("draggable: true");
    expect(html).toContain("classList.add('is-lifted')");
    expect(html).toContain("prefers-reduced-motion");
  });

  /** Close enough to see which building the tip is on. */
  it("comes in close on a pin, and on a tap made from across the city", () => {
    expect(PIN_ZOOM).toBe(18);
    const html = buildShopMapHtml(MODEL);
    expect(html).toContain(`map.getZoom() < ${CLOSE_ENOUGH_ZOOM}`);
    expect(html).toContain(`m.zoom || ${PIN_ZOOM}`);
  });

  it("swaps tiles only when the theme changes, not on every pin move", () => {
    expect(buildShopMapHtml(MODEL)).toContain("if (tileTheme !== m.theme)");
  });

  /** In a browser frame, any other page could otherwise move the pin. */
  it("takes models only from the page that drew it", () => {
    expect(buildShopMapHtml(MODEL)).toContain("e.source !== window.parent");
  });
});

describe("what the document sends back", () => {
  it("reads a moved pin", () => {
    expect(parseShopMapEvent('{"type":"pin","lat":7.1,"lng":125.6}')).toEqual({
      type: "pin",
      lat: 7.1,
      lng: 125.6,
    });
    expect(parseShopMapEvent('{"type":"ready"}')).toEqual({ type: "ready" });
  });

  /** A webview receives messages from anything the page loads. */
  it("ignores anything that is not one of its own two messages", () => {
    for (const raw of [
      "not json",
      "{}",
      '{"type":"pin"}',
      '{"type":"pin","lat":"7.1","lng":"125.6"}',
      '"webpackHotUpdate"',
      "null",
    ]) {
      expect(parseShopMapEvent(raw)).toBeNull();
    }
  });
});
