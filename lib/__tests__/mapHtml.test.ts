import { buildShopMapHtml, DAVAO_CENTRE, parseShopMapEvent } from "@/lib/mapHtml";

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
    expect(html).toContain("charAt(0).toUpperCase()");
    expect(html).toContain("C.M. Recto St");
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
