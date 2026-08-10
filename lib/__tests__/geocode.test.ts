import fs from "node:fs";
import path from "node:path";

import {
  buildReverseUrl,
  buildSearchUrl,
  clearGeocodeCaches,
  geocodeFailureMessage,
  isSearchable,
  MIN_REQUEST_INTERVAL_MS,
  resetRateLimiterForTests,
  reverseLabel,
  searchPlaces,
  shortenPlaceLabel,
  toPlaces,
  USER_AGENT,
} from "@/lib/geocode";

const ROOT = path.resolve(__dirname, "../..");

type FetchArgs = { url: string; init: RequestInit | undefined };

function stubFetch(handler: (url: string) => { status?: number; body: unknown }) {
  const calls: FetchArgs[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  clearGeocodeCaches();
  resetRateLimiterForTests();
});

describe("request shape", () => {
  it("asks OpenStreetMap, biased to Davao and to the Philippines", () => {
    const url = new URL(buildSearchUrl("Recto"));
    expect(url.origin).toBe("https://nominatim.openstreetmap.org");
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("Recto");
    expect(url.searchParams.get("countrycodes")).toBe("ph");
    expect(url.searchParams.get("viewbox")).toBeTruthy();
    expect(url.searchParams.get("format")).toBe("jsonv2");
  });

  it("reverses at a precision finer than a doorway", () => {
    const url = new URL(buildReverseUrl(7.0644, 125.6085));
    expect(url.pathname).toBe("/reverse");
    expect(url.searchParams.get("lat")).toBe("7.064400");
    expect(url.searchParams.get("lon")).toBe("125.608500");
  });

  /** The policy is explicit that a stock library agent is not enough. */
  it("identifies this app on every request", async () => {
    const calls = stubFetch(() => ({ body: [] }));
    await searchPlaces("Recto");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/GRIDGO/);
  });
});

describe("reading an answer", () => {
  it("drops the country and postcode a shop already knows", () => {
    expect(
      shortenPlaceLabel("C.M. Recto Street, Poblacion District, Davao City, 8000, Philippines"),
    ).toBe("C.M. Recto Street, Poblacion District, Davao City");
  });

  it("keeps something readable when the answer is one part long", () => {
    expect(shortenPlaceLabel("Philippines")).toBe("Philippines");
  });

  it("ignores entries with no usable point", () => {
    expect(
      toPlaces([
        { place_id: 1, lat: "7.06", lon: "125.6", display_name: "A, B, Philippines" },
        { place_id: 2, lat: "not a number", lon: "125.6", display_name: "B" },
        { place_id: 3, lat: "7.1", lon: "125.6" },
      ]),
    ).toEqual([{ id: "1", lat: 7.06, lng: 125.6, label: "A, B", detail: "A, B" }]);
  });

  it("treats a non-array answer as no results rather than throwing", () => {
    expect(toPlaces({ error: "Unable to geocode" })).toEqual([]);
  });
});

describe("the usage policy this module exists to keep", () => {
  it("spaces requests at least a second apart", async () => {
    stubFetch(() => ({ body: [] }));
    const started = Date.now();
    await Promise.all([searchPlaces("one"), searchPlaces("two"), searchPlaces("three")]);
    // Three requests cannot leave in under two intervals.
    expect(Date.now() - started).toBeGreaterThanOrEqual(2 * MIN_REQUEST_INTERVAL_MS - 50);
  }, 15000);

  it("never repeats an identical query", async () => {
    const calls = stubFetch(() => ({ body: [] }));
    await searchPlaces("Recto");
    await searchPlaces("  RECTO  ");
    expect(calls).toHaveLength(1);
  });

  it("remembers a point it has already named", async () => {
    const calls = stubFetch(() => ({ body: { display_name: "A, B, Philippines" } }));
    await reverseLabel(7.06441, 125.60851);
    await reverseLabel(7.06442, 125.60852);
    expect(calls).toHaveLength(1);
  });

  it("will not spend a request on two characters", () => {
    expect(isSearchable("re")).toBe(false);
    expect(isSearchable("   ")).toBe(false);
    expect(isSearchable("recto")).toBe(true);
  });

  /**
   * Autocomplete is forbidden outright by the policy, so there is deliberately
   * no per-keystroke entry point to reach for — and no screen may call search
   * from `onChangeText`.
   */
  it("is only ever called from a submit, never from typing", () => {
    const picker = fs.readFileSync(
      path.join(ROOT, "components/ShopLocationPicker.tsx"),
      "utf8",
    );
    expect(picker).toContain("onSubmitEditing");
    expect(picker).not.toMatch(/onChangeText=\{[^}]*runSearch/);
    expect(picker).not.toMatch(/onChangeText=\{[^}]*searchPlaces/);
  });
});

describe("when the geocoder does not answer", () => {
  it("says the map still works, and never shows a status code", async () => {
    stubFetch(() => ({ status: 429, body: {} }));
    const result = await searchPlaces("Recto");
    expect(result).toEqual({ ok: false, reason: "too_fast" });
    for (const reason of ["offline", "too_fast", "unavailable"] as const) {
      const message = geocodeFailureMessage(reason);
      expect(message).toMatch(/pin/i);
      expect(message).not.toMatch(/\d{3}/);
      expect(message).not.toMatch(/_/);
    }
  });

  it("keeps working after a network failure rather than wedging the queue", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await searchPlaces("first")).toEqual({ ok: false, reason: "offline" });

    stubFetch(() => ({ body: [] }));
    expect(await searchPlaces("second")).toEqual({ ok: true, value: [] });
  }, 15000);
});
