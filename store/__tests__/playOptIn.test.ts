import { Linking, Platform } from "react-native";

import * as api from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";

/**
 * The Play opt-in on the wire (gridgo-api `docs/PLAY_OPTIN_API.md`): every
 * call names the app, this platform and the APK's `sideload` channel; each
 * event is reported once, a close counts once, and a Gmail goes with the
 * Google-account assertion only when the shop gave it.
 */

const fetchMock = jest.fn();
const realOS = Platform.OS;

const optIn = (overrides: object = {}) => ({
  app: "supplier",
  show: true,
  step: "confirm_gmail",
  gmailSuggestion: "shop@gmail.com",
  groupMode: "link",
  campaignEnabled: true,
  optInUrl: "https://play.google.com/apps/testing/ph.gridgo.supplier",
  groupJoinUrl: "https://groups.google.com/g/example-testers",
  target: 12,
  optedIn: false,
  dismissCount: 0,
  playStoreUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.supplier",
  ...overrides,
});

function answer(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

let reply: (url: string, init?: RequestInit) => unknown = () => optIn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    const result = reply(url, init);
    return result && typeof result === "object" && "status" in (result as object) && "ok" in (result as object)
      ? result
      : answer(result);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  api.setToken("bearer");
  jest.spyOn(Linking, "openURL").mockClear().mockResolvedValue(true);
  reply = (url) => (String(url).includes("/event") ? { ok: true } : optIn());
  usePlayOptIn.getState().reset();
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  api.setToken(null);
  jest.restoreAllMocks();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function calls(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(path));
}

function events(): string[] {
  return calls("/me/play-optin/event").map(([, init]) => JSON.parse(String(init?.body)).type);
}

it("reads with app, platform and the APK's sideload channel", async () => {
  await usePlayOptIn.getState().load("u1");
  const [url] = calls("/me/play-optin")[0];
  expect(String(url)).toContain("/me/play-optin?app=supplier&platform=android&channel=sideload");
  expect(usePlayOptIn.getState().state?.show).toBe(true);
});

it("reports the Play build as channel play, which is GRIDGO's opt-in signal", async () => {
  process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
  await usePlayOptIn.getState().load("u1");
  expect(String(calls("/me/play-optin")[0][0])).toContain("channel=play");
});

it("sends shown once per session, tapped on entry, and every event with the install", async () => {
  await usePlayOptIn.getState().load("u1");
  usePlayOptIn.getState().shown();
  usePlayOptIn.getState().shown();
  usePlayOptIn.getState().tapped();
  await settle();
  expect(events()).toEqual(["shown", "tapped"]);
  const body = JSON.parse(String(calls("/me/play-optin/event")[0][1]?.body));
  expect(body).toEqual({ app: "supplier", platform: "android", channel: "sideload", type: "shown" });
});

it("counts a close once, never retried, and closes the card for the session", async () => {
  await usePlayOptIn.getState().load("u1");
  usePlayOptIn.getState().dismiss();
  await settle();
  expect(events()).toEqual(["dismissed"]);
  expect(usePlayOptIn.getState().closed).toBe(true);
  expect(usePlayOptIn.getState().state?.dismissCount).toBe(1);
});

it("confirms a Gmail without the assertion, and a custom address with it", async () => {
  await usePlayOptIn.getState().load("u1");
  reply = () => optIn({ step: "join_group" });
  expect(await usePlayOptIn.getState().confirmGmail(" shop@gmail.com ", false)).toBeNull();
  expect(JSON.parse(String(calls("/confirm-gmail")[0][1]?.body))).toEqual({
    app: "supplier",
    platform: "android",
    channel: "sideload",
    email: "shop@gmail.com",
  });
  expect(usePlayOptIn.getState().state?.step).toBe("join_group");

  await usePlayOptIn.getState().confirmGmail("owner@printshop.ph", true);
  expect(JSON.parse(String(calls("/confirm-gmail")[1][1]?.body))).toMatchObject({
    email: "owner@printshop.ph",
    googleAccount: true,
  });
});

it("says a refused Gmail in words, never the code", async () => {
  await usePlayOptIn.getState().load("u1");
  reply = () => answer({ error: "invalid_gmail" }, 400);
  expect(await usePlayOptIn.getState().confirmGmail("x@gmail.com", false)).toBe("Enter the Gmail you use on Google Play.");
  reply = () => answer({ error: "google_group_unavailable" }, 503);
  expect(await usePlayOptIn.getState().confirmGmail("x@gmail.com", false)).toBe("Google did not answer. Try again in a moment.");
});

it("link mode: reports group_opened, opens the group, then the Play testing page", async () => {
  reply = (url) => (String(url).includes("/event") ? { ok: true } : optIn({ step: "join_group" }));
  await usePlayOptIn.getState().load("u1");
  expect(await usePlayOptIn.getState().openGroup()).toBeNull();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://groups.google.com/g/example-testers");
  expect(usePlayOptIn.getState().progress.groupOpened).toBe(true);
  expect(await usePlayOptIn.getState().openOptIn()).toBeNull();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/apps/testing/ph.gridgo.supplier");
  expect(events()).toEqual(["group_opened", "optin_opened"]);
});

it("automatic mode: goes straight to the Play testing page", async () => {
  reply = (url) => (String(url).includes("/event") ? { ok: true } : optIn({ step: "open_optin", groupMode: "automatic", groupJoinUrl: null }));
  await usePlayOptIn.getState().load("u1");
  await usePlayOptIn.getState().openOptIn();
  expect(events()).toEqual(["optin_opened"]);
  await usePlayOptIn.getState().openPlayStore();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/store/apps/details?id=ph.gridgo.supplier");
});

it("does not open the link when GRIDGO refuses the step", async () => {
  await usePlayOptIn.getState().load("u1");
  reply = () => answer({ error: "gmail_not_confirmed" }, 409);
  expect(await usePlayOptIn.getState().openGroup()).toBe("Confirm your Gmail first.");
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it("forgets the answer for another account", async () => {
  await usePlayOptIn.getState().load("u1");
  usePlayOptIn.getState().dismiss();
  reply = () => optIn({ show: false });
  await usePlayOptIn.getState().load("u2");
  expect(usePlayOptIn.getState()).toMatchObject({ owner: "u2", closed: false });
  expect(usePlayOptIn.getState().state?.show).toBe(false);
});
