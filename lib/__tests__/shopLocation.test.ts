import {
  coordinateText,
  isFarFromDavao,
  isPlaced,
  isSamePin,
  PIN_CONSEQUENCE,
  pinProblem,
  withLabel,
} from "@/lib/shopLocation";

const DAVAO = { lat: 7.0644, lng: 125.6085, label: "C.M. Recto St, Davao City" };

describe("a pin a shop has actually placed", () => {
  it("accepts a real point", () => {
    expect(isPlaced(DAVAO)).toBe(true);
  });

  /**
   * Null island is where an unset pin lands, and a shop pinned there would have
   * every delivery priced from the Gulf of Guinea.
   */
  it("refuses the origin of the map, and anything missing", () => {
    expect(isPlaced(null)).toBe(false);
    expect(isPlaced(undefined)).toBe(false);
    expect(isPlaced({ lat: 0, lng: 0, label: "Nowhere" })).toBe(false);
    expect(isPlaced({ lat: Number.NaN, lng: 125.6, label: "x" })).toBe(false);
    expect(isPlaced({ lat: 200, lng: 125.6, label: "x" })).toBe(false);
  });
});

describe("warnings, not blocks", () => {
  it("questions a pin outside the city GRIDGO dispatches in", () => {
    expect(isFarFromDavao(DAVAO)).toBe(false);
    expect(isFarFromDavao({ lat: 14.5995, lng: 120.9842, label: "Manila" })).toBe(true);
    expect(isFarFromDavao(null)).toBe(false);
  });

  it("names what is missing, in the shop's words", () => {
    expect(pinProblem(null, "")).toMatch(/place your shop/i);
    expect(pinProblem(DAVAO, "  ")).toMatch(/address/i);
    expect(pinProblem(DAVAO, DAVAO.label)).toBeNull();
    expect(PIN_CONSEQUENCE).toMatch(/delivery fee/i);
  });
});

describe("editing", () => {
  it("shows enough precision to tell two pins apart", () => {
    expect(coordinateText(DAVAO)).toBe("7.064400, 125.608500");
  });

  it("knows when saving would change nothing", () => {
    expect(isSamePin(DAVAO, { ...DAVAO })).toBe(true);
    expect(isSamePin(DAVAO, withLabel(DAVAO, "  C.M. Recto St, Davao City  "))).toBe(true);
    expect(isSamePin(DAVAO, withLabel(DAVAO, "Somewhere else"))).toBe(false);
    expect(isSamePin(DAVAO, { ...DAVAO, lat: 7.07 })).toBe(false);
    expect(isSamePin(null, null)).toBe(true);
    expect(isSamePin(null, DAVAO)).toBe(false);
  });
});
