import {
  canUseDeviceLocation,
  LOCATION_BLOCKED,
  LOCATION_BROWSER_BLOCKED,
  LOCATION_DENIED,
  LOCATION_NEEDS_REBUILD,
  LOCATION_SERVICES_OFF,
  LOCATION_UNAVAILABLE,
  PRECISE_FIX_TIMEOUT_MS,
  requestCurrentLocation,
  roughFixMeters,
  setLocationModuleForTests,
  type LocationModule,
} from "@/lib/deviceLocation";

const Accuracy = { Low: 2, Balanced: 3, High: 4, Highest: 6 };

function fakeLocation(overrides: Partial<LocationModule> = {}): LocationModule & {
  getCurrentPositionAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
} {
  return {
    Accuracy,
    hasServicesEnabledAsync: jest.fn(async () => true),
    requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    getCurrentPositionAsync: jest.fn(async () => ({
      coords: { latitude: 7.0731, longitude: 125.6128, accuracy: 8.4 },
    })),
    ...overrides,
  } as never;
}

afterEach(() => {
  setLocationModuleForTests(undefined);
  jest.useRealTimers();
});

describe("Use my location", () => {
  it("asks for the satellite fix first and reports its radius in whole metres", async () => {
    const Location = fakeLocation();
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "ok",
      point: { lat: 7.0731, lng: 125.6128 },
      accuracyMeters: 8,
    });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Accuracy.Highest });
  });

  it("only ever asks for the while-in-use permission", async () => {
    const Location = fakeLocation();
    const background = jest.fn();
    setLocationModuleForTests({ ...Location, requestBackgroundPermissionsAsync: background } as never);
    await requestCurrentLocation();
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(background).not.toHaveBeenCalled();
  });

  it("falls back to the network's rougher fix when the satellites are slow, and says how rough", async () => {
    jest.useFakeTimers();
    const Location = fakeLocation();
    Location.getCurrentPositionAsync
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ coords: { latitude: 7.08, longitude: 125.61, accuracy: 120 } });
    setLocationModuleForTests(Location);
    const pending = requestCurrentLocation();
    await jest.advanceTimersByTimeAsync(PRECISE_FIX_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: "ok", point: { lat: 7.08, lng: 125.61 }, accuracyMeters: 120 });
    expect(Location.getCurrentPositionAsync).toHaveBeenLastCalledWith({ accuracy: Accuracy.Balanced });
  });

  it("falls back when the satellite fix fails outright", async () => {
    const Location = fakeLocation();
    Location.getCurrentPositionAsync
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ coords: { latitude: 7.08, longitude: 125.61, accuracy: 65 } });
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toMatchObject({ status: "ok", accuracyMeters: 65 });
  });

  it("offers to ask again after a refusal the phone will ask about again", async () => {
    setLocationModuleForTests(
      fakeLocation({ requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })) }),
    );
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "denied",
      message: LOCATION_DENIED,
      remedy: "retry",
    });
  });

  it("sends a permanent refusal to the phone's settings, not to a button that does nothing", async () => {
    setLocationModuleForTests(
      fakeLocation({ requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })) }),
    );
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "blocked",
      message: LOCATION_BLOCKED,
      remedy: "settings",
    });
  });

  it("says when the phone's location is switched off", async () => {
    const Location = fakeLocation({ hasServicesEnabledAsync: jest.fn(async () => false) });
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "services_off",
      message: LOCATION_SERVICES_OFF,
      remedy: "retry",
    });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("reads Expo's services-disabled error as location off", async () => {
    const off = Object.assign(new Error("off"), { code: "E_LOCATION_SERVICES_DISABLED" });
    const Location = fakeLocation();
    Location.getCurrentPositionAsync.mockRejectedValue(off);
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toMatchObject({ status: "services_off" });
  });

  it("invents no point when neither fix answers", async () => {
    const Location = fakeLocation();
    Location.getCurrentPositionAsync.mockRejectedValue(new Error("no fix"));
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "unavailable",
      message: LOCATION_UNAVAILABLE,
      remedy: "retry",
    });
  });

  it("refuses the map's origin and impossible coordinates as a fix", async () => {
    const Location = fakeLocation();
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 0, longitude: 0, accuracy: 5 } });
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toMatchObject({ status: "unavailable" });
  });

  it("tells an APK without the module to update, rather than crashing", async () => {
    setLocationModuleForTests(null);
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "needs_rebuild",
      message: LOCATION_NEEDS_REBUILD,
      remedy: "none",
    });
  });

  it("never says a code or a state name", () => {
    for (const message of [LOCATION_BLOCKED, LOCATION_DENIED, LOCATION_NEEDS_REBUILD, LOCATION_SERVICES_OFF, LOCATION_UNAVAILABLE]) {
      expect(message).not.toMatch(/[a-z]+_[a-z]+|E_|ERR/);
    }
  });
});

describe("how rough a fix is", () => {
  it("names a fix wider than 30 m and is quiet about a door-level one", () => {
    expect(roughFixMeters(85.4)).toBe(85);
    expect(roughFixMeters(30)).toBeNull();
    expect(roughFixMeters(12)).toBeNull();
    expect(roughFixMeters(null)).toBeNull();
    expect(roughFixMeters(Number.NaN)).toBeNull();
  });
});

describe("on the web build", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require("react-native") as typeof import("react-native");
  const realNavigator = (globalThis as { navigator?: unknown }).navigator;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
  });

  function onWeb(geolocation: unknown) {
    jest.replaceProperty(Platform, "OS", "web");
    Object.defineProperty(globalThis, "navigator", { value: { geolocation }, configurable: true });
  }

  it("asks the browser for a high-accuracy fix and never touches the native module", async () => {
    const getCurrentPosition = jest.fn((ok: (p: unknown) => void, _fail: unknown, _options: unknown) =>
      ok({ coords: { latitude: 7.07, longitude: 125.61, accuracy: 42 } }),
    );
    onWeb({ getCurrentPosition });
    const Location = fakeLocation();
    setLocationModuleForTests(Location);
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "ok",
      point: { lat: 7.07, lng: 125.61 },
      accuracyMeters: 42,
    });
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("reads the browser's refusal as the browser's to undo, with no settings button", async () => {
    onWeb({ getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }) });
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "blocked",
      message: LOCATION_BROWSER_BLOCKED,
      remedy: "none",
    });
  });

  it("hides the control in a browser with no geolocation", () => {
    onWeb(undefined);
    expect(canUseDeviceLocation()).toBe(false);
  });
});
