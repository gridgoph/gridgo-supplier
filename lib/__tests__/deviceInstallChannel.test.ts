import { Platform } from "react-native";
import * as api from "../api";

/**
 * `POST /devices` reports how this build was installed, signed in or not
 * (gridgo-api `docs/RELEASE_ANNOUNCEMENTS_API.md#install-channels`).
 */
const fetchMock = jest.fn();
const realOS = Platform.OS;

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ device: {}, created: false, reassigned: false }),
    json: async () => ({ device: {}, created: false, reassigned: false }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  api.setToken(null);
});

function sentBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/devices"));
  return JSON.parse(String(call?.[1]?.body));
}

it.each([
  ["android", undefined, "apk"],
  ["android", "play", "play"],
  ["ios", undefined, "ios"],
] as const)("an %s build with distribution %s reports %s", async (os, distribution, expected) => {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  if (distribution) process.env.EXPO_PUBLIC_APP_DISTRIBUTION = distribution;

  await api.registerDeviceUnclaimed("token-1", os);
  expect(sentBody()).toEqual({
    token: "token-1",
    platform: os,
    appRole: "supplier",
    tokenProvider: os === "ios" ? "apns" : "fcm",
    installChannel: expected,
  });

  fetchMock.mockClear();
  api.setToken("bearer");
  await api.registerDevice("token-1", os);
  expect(sentBody()).toMatchObject({ installChannel: expected, appRole: "supplier" });
});

it("reports no channel from web, which no release reaches", async () => {
  await api.registerDeviceUnclaimed("token-1", "web");
  expect(sentBody()).not.toHaveProperty("installChannel");
});
