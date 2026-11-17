import { buildShopMapHtml, type ShopMapModel } from "@/lib/mapHtml";

/**
 * Runs the map document's own script against a stand-in Leaflet, so the
 * accuracy circle is tested by what it does — drawn for a phone fix, gone the
 * moment the shop picks the pin up or taps — and not by a string it contains.
 */
type Handler = (event?: unknown) => void;

function runDocument(model: ShopMapModel) {
  const circles: { radius: number; color: string; removed: boolean }[] = [];
  const views: { kind: string; args: unknown[] }[] = [];
  const mapHandlers: Record<string, Handler> = {};
  const markerHandlers: Record<string, Handler> = {};
  const sent: unknown[] = [];
  const layerRemoved = (layer: { removed?: boolean }) => {
    layer.removed = true;
  };

  const map = {
    on: (name: string, fn: Handler) => (mapHandlers[name] = fn),
    setView: (...args: unknown[]) => views.push({ kind: "setView", args }),
    fitBounds: (...args: unknown[]) => views.push({ kind: "fitBounds", args }),
    getZoom: () => 18,
    removeLayer: layerRemoved,
  };
  const marker = {
    addTo: () => marker,
    on: (name: string, fn: Handler) => (markerHandlers[name] = fn),
    setLatLng: () => marker,
    getLatLng: () => ({ lat: 7.07, lng: 125.61 }),
    getElement: () => ({ classList: { add: () => undefined, remove: () => undefined }, title: "" }),
  };
  const L = {
    map: () => map,
    control: { zoom: () => ({ addTo: () => undefined }) },
    tileLayer: () => ({ addTo: () => undefined }),
    divIcon: () => ({}),
    marker: () => marker,
    circle: (_at: unknown, options: { radius: number; color: string }) => {
      const circle = { radius: options.radius, color: options.color, removed: false };
      circles.push(circle);
      return { addTo: () => circle };
    },
    latLng: (lat: number, lng: number) => ({ toBounds: (size: number) => ({ lat, lng, size }) }),
  };
  const hint = { className: "hint" };
  const fakeDocument = {
    body: { className: "" },
    getElementById: () => hint,
    addEventListener: () => undefined,
  };
  const fakeWindow: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (text: string) => sent.push(JSON.parse(text)) },
    addEventListener: () => undefined,
    matchMedia: () => ({ matches: false }),
  };
  fakeWindow.parent = fakeWindow;

  const html = buildShopMapHtml(model);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const body = scripts[scripts.length - 1];
  const env = new Function("L", "document", "window", `${body}; return { applyModel: applyModel };`);
  const doc = env(L, fakeDocument, fakeWindow) as { applyModel: (m: ShopMapModel) => void };
  return { circles, views, mapHandlers, markerHandlers, sent, doc };
}

const PIN = { lat: 7.0731, lng: 125.6128 };
const BASE: ShopMapModel = { theme: "light", pin: PIN, label: "", recentre: true, zoom: 18 };

describe("the phone's accuracy circle", () => {
  it("draws the fix's radius in the info colour, light and dark", () => {
    expect(runDocument({ ...BASE, accuracyMeters: 85 }).circles[0]).toMatchObject({ radius: 85, color: "#1565C0" });
    expect(runDocument({ ...BASE, theme: "dark", accuracyMeters: 85 }).circles[0]).toMatchObject({
      color: "#42A5F5",
    });
  });

  it("draws nothing for a searched or hand-placed pin", () => {
    expect(runDocument({ ...BASE, accuracyMeters: null }).circles).toHaveLength(0);
    expect(runDocument(BASE).circles).toHaveLength(0);
  });

  it("shows a rough fix's whole circle, and a close one at door zoom", () => {
    const rough = runDocument({ ...BASE, accuracyMeters: 120 });
    expect(rough.views.at(-1)).toMatchObject({ kind: "fitBounds" });
    const close = runDocument({ ...BASE, accuracyMeters: 12 });
    expect(close.views.at(-1)).toEqual({ kind: "setView", args: [[PIN.lat, PIN.lng], 18, { animate: true }] });
  });

  it("goes the moment the shop picks the pin up, and the drop is sent back", () => {
    const run = runDocument({ ...BASE, accuracyMeters: 85 });
    run.markerHandlers.dragstart?.();
    expect(run.circles[0].removed).toBe(true);
    run.markerHandlers.dragend?.();
    expect(run.sent).toContainEqual({ type: "pin", lat: 7.07, lng: 125.61 });
  });

  it("goes when the shop taps somewhere else on the map", () => {
    const run = runDocument({ ...BASE, accuracyMeters: 85 });
    run.mapHandlers.click?.({ latlng: { lat: 7.08, lng: 125.62 } });
    expect(run.circles[0].removed).toBe(true);
    expect(run.sent).toContainEqual({ type: "pin", lat: 7.08, lng: 125.62 });
  });
});
