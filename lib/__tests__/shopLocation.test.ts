import {
  coordinateText,
  isFarFromDavao,
  isPlaced,
  isSamePin,
  PIN_CONSEQUENCE,
  pinBlocker,
  pinProblem,
  pinStatus,
  PIN_OUTSIDE_PROBLEM,
  PIN_READING_PROBLEM,
  type PinStatusInput,
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

describe("the line above the address", () => {
  const SET: PinStatusInput = {
    placed: true,
    reading: false,
    outside: false,
    lookup: null,
    precision: null,
    placeName: "",
  };

  it("says nothing before a pin, or about a pin that is fine", () => {
    expect(pinStatus({ ...SET, placed: false })).toBeNull();
    expect(pinStatus(SET)).toBeNull();
    expect(pinStatus({ ...SET, precision: "exact", placeName: "Jollibee" })).toBeNull();
  });

  it("says the address is being read", () => {
    expect(pinStatus({ ...SET, reading: true })).toMatchObject({ tone: "busy", title: "Reading this place…" });
  });

  it("warns first when the pin is outside Davao City", () => {
    expect(pinStatus({ ...SET, outside: true, reading: true, precision: "area" })).toMatchObject({
      tone: "warning",
      title: "Outside Davao City",
    });
  });

  /** A barangay or a road is somewhere to look, not the shop's door. */
  it("asks for a drag onto the door after a barangay or road result", () => {
    expect(pinStatus({ ...SET, precision: "area", placeName: "Talomo Proper" })).toEqual({
      tone: "hint",
      title: "This is the middle of Talomo Proper",
      detail: "Drag the pin onto your shop's door.",
    });
    expect(pinStatus({ ...SET, precision: "street", placeName: "Quimpo Boulevard" })).toMatchObject({
      title: "Somewhere on Quimpo Boulevard",
    });
  });

  it("asks for the address to be typed when the map names no street, or the lookup failed", () => {
    expect(pinStatus({ ...SET, lookup: "no_street" })?.title).toBe("No street name on the map here");
    expect(pinStatus({ ...SET, lookup: "failed" })?.title).toBe("Could not read this address");
  });

  it("never says a status code or a state name", () => {
    const inputs: PinStatusInput[] = [
      { ...SET, reading: true },
      { ...SET, outside: true },
      { ...SET, precision: "area", placeName: "Talomo" },
      { ...SET, lookup: "failed" },
    ];
    for (const input of inputs) {
      const status = pinStatus(input);
      expect(`${status?.title} ${status?.detail ?? ""}`).not.toMatch(/_|\d{3}/);
    }
  });
});

describe("outside Davao City", () => {
  it("reaches the north of the city, where the old box stopped short", () => {
    // Marilog District.
    expect(isFarFromDavao({ lat: 7.45, lng: 125.27, label: "Marilog" })).toBe(false);
    // Talomo, Santo Tomas, Davao del Norte.
    expect(isFarFromDavao({ lat: 7.5286, lng: 125.7228, label: "Talomo" })).toBe(true);
  });
});

describe("what stops the pin being used", () => {
  it("refuses a pin outside Davao City, and a move still being read", () => {
    expect(pinBlocker({ outside: true, reading: true })).toBe(PIN_OUTSIDE_PROBLEM);
    expect(pinBlocker({ outside: false, reading: true })).toBe(PIN_READING_PROBLEM);
    expect(pinBlocker({ outside: false, reading: false })).toBeNull();
  });
});

describe("a pin on Samal", () => {
  /** No network needed: a typed address cannot carry a Samal pin past a failed lookup. */
  it("is a problem whatever the address says", () => {
    expect(pinProblem({ lat: 7.082, lng: 125.682, label: "Babak Road" }, "Babak Road")).toBe(PIN_OUTSIDE_PROBLEM);
    expect(pinProblem({ lat: 7.125, lng: 125.664, label: "Sasa wharf" }, "Sasa wharf")).toBeNull();
  });
});
