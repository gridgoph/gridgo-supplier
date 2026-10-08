import { buildApproachMapHtml, type ApproachMapModel } from "@/lib/approachMapHtml";
import { fallbackRoute, fetchRoute, parseOsrmResponse } from "@/lib/osrm";
import {
  approachReadout,
  locationAge,
  parseRiderApproach,
  roughMinutes,
  type ApproachRoute,
  type RiderApproach,
} from "@/lib/riderApproach";

const NOW = Date.parse("2026-10-08T06:00:00.000Z");
const SHOP = { lat: 7.0731, lng: 125.6128 };
const secondsAgo = (s: number) => new Date(NOW - s * 1000).toISOString();

function approach(partial: Partial<RiderApproach> = {}): RiderApproach {
  return { ping: { lat: 7.09, lng: 125.6, at: secondsAgo(20) }, shop: SHOP, hidden: null, ...partial };
}

const ROAD: ApproachRoute = {
  routed: true,
  distanceMetres: 2400,
  durationSeconds: 540,
  coordinates: [
    [125.6, 7.09],
    [125.6128, 7.0731],
  ],
};

describe("parseRiderApproach", () => {
  it("reads the ping and the shop's pick-up point", () => {
    const parsed = parseRiderApproach({
      ping: { id: "ping_1", lat: 7.09, lng: 125.6, accuracy: 8, at: secondsAgo(5) },
      shop: SHOP,
    });
    expect(parsed).toEqual({
      ping: { lat: 7.09, lng: 125.6, accuracy: 8, at: secondsAgo(5) },
      shop: SHOP,
      hidden: null,
    });
  });

  it("drops the position once GRIDGO says the job was picked up", () => {
    const parsed = parseRiderApproach({ ping: { lat: 7.09, lng: 125.6, at: secondsAgo(5) }, hidden: "picked_up" });
    expect(parsed.ping).toBeNull();
    expect(parsed.hidden).toBe("picked_up");
  });

  it("treats a malformed ping or shop as absent", () => {
    expect(parseRiderApproach({ ping: { lat: "7", lng: 125, at: "now" }, shop: { lat: 200, lng: 1 } })).toEqual({
      ping: null,
      shop: null,
      hidden: null,
    });
    expect(parseRiderApproach(null)).toEqual({ ping: null, shop: null, hidden: null });
  });
});

describe("locationAge", () => {
  it("says seconds in steps of five, then minutes", () => {
    expect(locationAge(secondsAgo(3), NOW)).toBe("just now");
    expect(locationAge(secondsAgo(22), NOW)).toBe("20 s ago");
    expect(locationAge(secondsAgo(130), NOW)).toBe("2 min ago");
    expect(locationAge(secondsAgo(7300), NOW)).toBe("2 h ago");
  });
});

describe("approachReadout", () => {
  it("says plainly when the rider has not shared a location", () => {
    const readout = approachReadout({ approach: approach({ ping: null }), route: null, riderName: "Jun", now: NOW });
    expect(readout.kind).toBe("waiting");
    expect(readout.headline).toBe("Jun has not shared a location yet");
    expect(readout.freshness).toEqual({ tone: "neutral", label: "No location yet", icon: "clock" });
    expect(readout.distance).toBeNull();
  });

  it("gives road distance, a rough time and how fresh the fix is", () => {
    const readout = approachReadout({ approach: approach(), route: ROAD, riderName: "Jun", now: NOW });
    expect(readout.kind).toBe("live");
    expect(readout.headline).toBe("Jun is about 9 min away");
    expect(readout.distance).toBe("2.4 km by road");
    expect(readout.freshness.label).toBe("Updated 20 s ago");
    expect(readout.detail).toMatch(/rough guess/i);
    expect(readout.faded).toBe(false);
  });

  it("says a straight line is a straight line", () => {
    const readout = approachReadout({
      approach: approach(),
      route: fallbackRoute({ lat: 7.09, lng: 125.6 }, SHOP),
      riderName: null,
      now: NOW,
    });
    expect(readout.headline).toMatch(/^The rider is about \d+ min away$/);
    expect(readout.distance).toMatch(/in a straight line$/);
  });

  it("fades an old position and says why in words", () => {
    const readout = approachReadout({
      approach: approach({ ping: { lat: 7.09, lng: 125.6, at: secondsAgo(5 * 60) } }),
      route: ROAD,
      riderName: "Jun",
      now: NOW,
    });
    expect(readout.kind).toBe("stale");
    expect(readout.faded).toBe(true);
    expect(readout.freshness).toEqual({ tone: "warning", label: "Last seen 5 min ago", icon: "triangle-alert" });
    expect(readout.detail).toMatch(/Message them/);
  });

  it("stops counting minutes when the rider is at the door", () => {
    const readout = approachReadout({
      approach: approach({ ping: { lat: 7.0732, lng: 125.6129, at: secondsAgo(4) } }),
      route: { ...ROAD, distanceMetres: 40, durationSeconds: 10 },
      riderName: "Jun",
      now: NOW,
    });
    expect(readout.kind).toBe("arriving");
    expect(readout.headline).toBe("Jun is almost at your shop");
  });
});

describe("roughMinutes", () => {
  it("never says zero, and pads a straight line for city streets", () => {
    expect(roughMinutes({ ...ROAD, durationSeconds: 5 })).toBe(1);
    expect(roughMinutes({ routed: false, distanceMetres: 3000, durationSeconds: 0, coordinates: [] })).toBe(13);
  });
});

describe("parseOsrmResponse", () => {
  it("takes the first road route and refuses anything unusable", () => {
    expect(parseOsrmResponse({ code: "Ok", routes: [{ distance: 2400, duration: 540, geometry: { coordinates: ROAD.coordinates } }] }))
      .toEqual(ROAD);
    expect(parseOsrmResponse({ code: "NoRoute" })).toBeNull();
    expect(parseOsrmResponse({ code: "Ok", routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }] })).toBeNull();
  });
});

describe("fetchRoute", () => {
  it("draws the straight line when the router hangs", async () => {
    jest.useFakeTimers();
    try {
      const hanging = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })) as unknown as typeof fetch;
      const pending = fetchRoute({ lat: 7.09, lng: 125.6 }, SHOP, { fetchImpl: hanging });
      jest.advanceTimersByTime(8_000);
      const route = await pending;
      expect(route.routed).toBe(false);
      expect(route.coordinates).toEqual([
        [125.6, 7.09],
        [SHOP.lng, SHOP.lat],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("buildApproachMapHtml", () => {
  const model: ApproachMapModel = {
    theme: "light",
    shop: SHOP,
    rider: { lat: 7.09, lng: 125.6 },
    riderLabel: "</script><script>alert(1)</script>",
    faded: false,
    route: ROAD.coordinates,
    colors: { route: "#FFDE58", casing: "#1A1A1A", rider: "#1565C0", shopFill: "#1A1A1A", shopInk: "#FFFFFF" },
  };

  it("cannot be broken out of by a name", () => {
    const html = buildApproachMapHtml(model);
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("says it is ready as soon as it can take a model", () => {
    expect(buildApproachMapHtml(model)).toContain("send({ type: 'ready' })");
  });

  it("pins Leaflet by hash and keeps attribution", () => {
    const html = buildApproachMapHtml(model);
    expect(html).toContain('integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"');
    expect(html).toContain("OpenStreetMap</a> contributors");
    expect(html).not.toMatch(/google/i);
  });
});
