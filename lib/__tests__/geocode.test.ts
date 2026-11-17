import fs from "node:fs";
import path from "node:path";

import {
  addressOf,
  barangayOf,
  buildReverseUrl,
  buildSearchUrl,
  clearGeocodeCaches,
  geocodeFailureMessage,
  GEOCODE_TIMEOUT_MS,
  isDavaoCityHit,
  isSearchable,
  MIN_REQUEST_INTERVAL_MS,
  normalizeQuery,
  precisionOf,
  resetRateLimiterForTests,
  reverseAddress,
  searchPlaces,
  shortenPlaceLabel,
  toPlaces,
  USER_AGENT,
  withoutUnitNumber,
  type NominatimHit,
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
  it("asks OpenStreetMap, bounded to Davao City", () => {
    const url = new URL(buildSearchUrl("Recto"));
    expect(url.origin).toBe("https://nominatim.openstreetmap.org");
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("Recto");
    expect(url.searchParams.get("countrycodes")).toBe("ph");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    // Bounded: a Talomo in Santo Tomas, Davao del Norte was the first row.
    expect(url.searchParams.get("bounded")).toBe("1");
    // The whole city, Marilog and Paquibato included (north to 7.61 N).
    expect(url.searchParams.get("viewbox")).toBe("125.21,7.61,125.71,6.95");
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

const CITY = { city: "Davao City" };

function hit(extra: Partial<NominatimHit> & { address?: NominatimHit["address"] }): NominatimHit {
  return { place_id: 1, lat: "7.06", lon: "125.6", display_name: "x, Davao City, Philippines", ...extra };
}

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
    const places = toPlaces([
      hit({ place_id: 1, name: "A", address: { road: "B Street", ...CITY } }),
      hit({ place_id: 2, lat: "not a number" }),
      { place_id: 3, lat: "7.1", lon: "125.6" },
    ]);
    expect(places.map((place) => place.id)).toEqual(["1"]);
  });

  it("treats a non-array answer as no results rather than throwing", () => {
    expect(toPlaces({ error: "Unable to geocode" })).toEqual([]);
  });

  it("names a row by the place and tells same-named places apart by road and barangay", () => {
    const [place] = toPlaces([
      hit({
        name: "Jollibee",
        category: "amenity",
        type: "fast_food",
        address: { amenity: "Jollibee", road: "Quimpo Boulevard", quarter: "Ecoland", suburb: "Talomo District", ...CITY },
      }),
    ]);
    expect(place).toMatchObject({
      label: "Jollibee",
      detail: "Quimpo Boulevard, Ecoland",
      address: "Jollibee, Quimpo Boulevard, Ecoland",
      precision: "exact",
    });
  });

  it("folds a road OSM split into several ways into one row per barangay", () => {
    const way = (id: number, lat: string, quarter: string) =>
      hit({ place_id: id, lat, name: "Quimpo Boulevard", category: "highway", type: "primary", address: { road: "Quimpo Boulevard", quarter, ...CITY } });
    const places = toPlaces([
      way(1, "7.0600", "Matina"),
      way(2, "7.0601", "Matina"),
      way(3, "7.0700", "Ecoland"),
      way(4, "7.0702", "Ecoland"),
    ]);
    expect(places.map((place) => place.detail)).toEqual(["Matina", "Ecoland"]);
    expect(places[0].precision).toBe("street");
  });

  it("shows no more than five rows", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      hit({ place_id: i, name: `Shop ${i}`, address: { road: "Recto", ...CITY } }),
    );
    expect(toPlaces(many)).toHaveLength(5);
  });

  /** The middle of a barangay is nobody's door, so it fills no address. */
  it("offers a barangay as a place to look, without an address", () => {
    const [place] = toPlaces([
      hit({ name: "Talomo Proper", category: "place", type: "quarter", address: { quarter: "Talomo Proper", ...CITY } }),
    ]);
    expect(place).toMatchObject({ label: "Talomo Proper", address: "", precision: "area" });
  });
});

describe("inside Davao City, and nowhere else", () => {
  it("refuses another town by name, even inside the box", () => {
    const samal = hit({ address: { city: "Island Garden City of Samal" }, display_name: "Peñaplata, Samal" });
    expect(isDavaoCityHit(samal, 7.07, 125.69)).toBe(false);
    expect(toPlaces([{ ...samal, name: "Peñaplata", lat: "7.07", lon: "125.69" }])).toEqual([]);
  });

  it("refuses a point outside the city's box, whatever it is called", () => {
    // Talomo, Santo Tomas, Davao del Norte: the first row "Brgy. Talomo" used to offer.
    const santoTomas = hit({ name: "Talomo", lat: "7.5286", lon: "125.7228", address: { town: "Santo Tomas" } });
    expect(toPlaces([santoTomas])).toEqual([]);
  });

  it("keeps Marilog, which the old box cut off", () => {
    const marilog = hit({ name: "Marilog Proper", lat: "7.45", lon: "125.27", category: "place", type: "village", address: { village: "Marilog Proper", ...CITY } });
    expect(toPlaces([marilog])).toHaveLength(1);
  });

  it("trusts the box when OSM names no city at all", () => {
    expect(isDavaoCityHit({ display_name: "Some road" }, 7.07, 125.6)).toBe(true);
  });
});

describe("how exactly a result pins the shop", () => {
  it("reads a door, a road, or an area", () => {
    expect(precisionOf({ category: "shop", type: "copyshop" })).toBe("exact");
    expect(precisionOf({ category: "highway", type: "residential" })).toBe("street");
    expect(precisionOf({ category: "place", type: "suburb" })).toBe("area");
    expect(precisionOf({ category: "boundary", type: "administrative" })).toBe("area");
    expect(precisionOf({ category: "landuse", type: "commercial" })).toBe("area");
  });
});

describe("the address a rider reads", () => {
  it("is the street and the barangay, not a district or a road code", () => {
    const answer = hit({
      address: { road: "C. Bangoy Street", quarter: "Barangay 4-A", suburb: "Poblacion District", ...CITY },
    });
    expect(addressOf(answer)).toBe("C. Bangoy Street, Barangay 4-A");
    expect(barangayOf(answer)).toBe("Barangay 4-A");
  });

  it("falls back to the district only when nothing finer is there", () => {
    expect(barangayOf(hit({ address: { suburb: "Poblacion District" } }))).toBe("Poblacion District");
  });

  it("does not say a road's name twice", () => {
    expect(addressOf(hit({ name: "MacArthur Highway", address: { road: "MacArthur Highway", quarter: "Matina", ...CITY } }))).toBe(
      "MacArthur Highway, Matina",
    );
  });

  it("puts the house number before the road", () => {
    expect(addressOf(hit({ address: { house_number: "123", road: "Rizal Street", ...CITY } }))).toBe("123 Rizal Street");
  });

  /** A barangay is not a street; the shop types one rather than reading an invented one. */
  it("is nothing where OSM names no street", () => {
    expect(addressOf(hit({ address: { quarter: "Talomo Proper", ...CITY } }))).toBe("");
  });
});

describe("Davao spellings", () => {
  it("reads Brgy., street abbreviations and a trailing Davao City", () => {
    expect(normalizeQuery("Brgy. Talomo")).toBe("Talomo");
    expect(normalizeQuery("Quimpo Blvd")).toBe("Quimpo Boulevard");
    expect(normalizeQuery("Bonifacio St., Davao City")).toBe("Bonifacio Street");
    expect(normalizeQuery("MacArthur Hwy")).toBe("MacArthur Highway");
    expect(normalizeQuery("Ateneo de Davao")).toBe("Ateneo de Davao");
  });

  it("tries again without a house or unit number OSM does not carry", () => {
    expect(withoutUnitNumber("123 Quimpo Boulevard")).toBe("Quimpo Boulevard");
    expect(withoutUnitNumber("Unit 4B, Abreeza Residences")).toBe("Abreeza Residences");
    expect(withoutUnitNumber("Quimpo Boulevard")).toBeNull();
  });

  it("searches the cleaned words, then the street alone when nothing matched", async () => {
    const calls = stubFetch((url) =>
      new URL(url).searchParams.get("q") === "Rizal Street"
        ? { body: [hit({ name: "Rizal Street", category: "highway", address: { road: "Rizal Street", ...CITY } })] }
        : { body: [] },
    );
    const result = await searchPlaces("12 Rizal St.");
    expect(calls.map((call) => new URL(call.url).searchParams.get("q"))).toEqual(["12 Rizal Street", "Rizal Street"]);
    expect(result.ok && result.value.map((place) => place.label)).toEqual(["Rizal Street"]);
  }, 15000);
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
    const calls = stubFetch(() => ({ body: { address: { road: "Recto", ...CITY } } }));
    await reverseAddress(7.06441, 125.60851);
    await reverseAddress(7.06442, 125.60852);
    expect(calls).toHaveLength(1);
  });

  /** A lookup the shop has moved past must not spend a slot of the budget. */
  it("drops a superseded lookup before it reaches the network", async () => {
    const calls = stubFetch(() => ({ body: [] }));
    const result = await searchPlaces("Recto", { isCurrent: () => false });
    expect(result).toEqual({ ok: false, reason: "superseded" });
    expect(calls).toHaveLength(0);
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
    for (const reason of ["offline", "too_fast", "unavailable", "slow"] as const) {
      const message = geocodeFailureMessage(reason);
      expect(message).toMatch(/tap .*map/i);
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

  it("gives up on a lookup that does not answer, and says it is slow", async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ) as unknown as typeof fetch;
      const pending = searchPlaces("Recto");
      await jest.advanceTimersByTimeAsync(GEOCODE_TIMEOUT_MS + 10);
      expect(await pending).toEqual({ ok: false, reason: "slow" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the address at a dropped pin", () => {
  it("is the street and barangay, and says when the point is another town", async () => {
    stubFetch(() => ({
      body: { address: { road: "Peñaplata Road", city: "Island Garden City of Samal" }, display_name: "Samal" },
    }));
    expect(await reverseAddress(7.07, 125.69)).toEqual({
      ok: true,
      value: { address: "Peñaplata Road", inDavao: false },
    });
  });

  it("is nothing where OSM names no street", async () => {
    stubFetch(() => ({ body: { address: { quarter: "Talomo Proper", ...CITY } } }));
    expect(await reverseAddress(7.05, 125.55)).toEqual({ ok: true, value: { address: null, inDavao: true } });
  });
});
