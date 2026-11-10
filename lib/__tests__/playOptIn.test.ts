import type { PlayOptInState } from "@/lib/api";
import {
  checkGmail,
  currentOptInStep,
  optInCardVisible,
  optInInstall,
  optInSteps,
  PLAY_OPTIN_DISMISS_LIMIT,
} from "@/lib/playOptIn";

/** The Play opt-in rules: Android APK only, GRIDGO's `show`, three closes, the Gmail, both group modes. */

const state = (overrides: Partial<PlayOptInState> = {}): PlayOptInState => ({
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

const android = { platform: "android", channel: "sideload" } as const;
const none = { groupOpened: false, optInOpened: false };

describe("install", () => {
  it("reports the platform and maps the APK to sideload", () => {
    expect(optInInstall("android", "sideload")).toEqual({ platform: "android", channel: "sideload" });
    expect(optInInstall("android", "play")).toEqual({ platform: "android", channel: "play" });
    expect(optInInstall("ios", "sideload")).toEqual({ platform: "ios", channel: "sideload" });
    expect(optInInstall("web", "sideload")).toEqual({ platform: "web", channel: "sideload" });
  });

  it("lets a development web build walk the Android path", () => {
    expect(optInInstall("web", "sideload", true)).toEqual(android);
  });
});

describe("card visibility", () => {
  it("draws on an Android APK when GRIDGO says show", () => {
    expect(optInCardVisible(state(), android)).toBe(true);
  });

  it("never draws on iOS or web, whatever GRIDGO says", () => {
    expect(optInCardVisible(state(), { platform: "ios", channel: "sideload" })).toBe(false);
    expect(optInCardVisible(state(), { platform: "web", channel: "sideload" })).toBe(false);
  });

  it("never draws on the Play build", () => {
    expect(optInCardVisible(state(), { platform: "android", channel: "play" })).toBe(false);
  });

  it("honours show=false and a recorded opt-in", () => {
    expect(optInCardVisible(null, android)).toBe(false);
    expect(optInCardVisible(state({ show: false }), android)).toBe(false);
    expect(optInCardVisible(state({ optedIn: true }), android)).toBe(false);
    expect(optInCardVisible(state({ step: "opted_in" }), android)).toBe(false);
  });

  it("hides after the third close", () => {
    expect(optInCardVisible(state({ dismissCount: 2 }), android)).toBe(true);
    expect(optInCardVisible(state({ dismissCount: PLAY_OPTIN_DISMISS_LIMIT }), android)).toBe(false);
  });
});

describe("checkGmail", () => {
  it("accepts Gmail and Googlemail as they are", () => {
    expect(checkGmail(" Shop@Gmail.com ", false)).toEqual({ ok: true, googleAccount: false });
    expect(checkGmail("shop@googlemail.com", false)).toEqual({ ok: true, googleAccount: false });
  });

  it("refuses an empty or malformed address with a sentence", () => {
    expect(checkGmail("", false)).toMatchObject({ ok: false, error: "Enter your Gmail." });
    expect(checkGmail("shop@", false)).toMatchObject({ ok: false, needsGoogleAccount: false });
    expect(checkGmail("sh op@gmail.com", false)).toMatchObject({ ok: false });
  });

  it("asks a custom address to be named a Google account first", () => {
    expect(checkGmail("owner@printshop.ph", false)).toEqual({ ok: false, error: null, needsGoogleAccount: true });
    expect(checkGmail("owner@printshop.ph", true)).toEqual({ ok: true, googleAccount: true });
  });
});

describe("steps", () => {
  it("link mode walks Gmail, group, Play testing, install", () => {
    expect(optInSteps(state(), none).map((s) => `${s.key}:${s.status}`)).toEqual([
      "gmail:current",
      "group:ahead",
      "optin:ahead",
      "install:ahead",
    ]);
    const joined = state({ step: "join_group" });
    expect(currentOptInStep(joined, none)).toBe("group");
    expect(currentOptInStep(joined, { groupOpened: true, optInOpened: false })).toBe("optin");
    expect(currentOptInStep(state({ step: "open_optin" }), none)).toBe("optin");
    expect(currentOptInStep(state({ step: "install_from_play" }), none)).toBe("install");
  });

  it("automatic mode has no group step and goes straight to Play testing", () => {
    const auto = state({ groupMode: "automatic", step: "open_optin" });
    expect(optInSteps(auto, none).map((s) => `${s.key}:${s.status}`)).toEqual([
      "gmail:done",
      "optin:current",
      "install:ahead",
    ]);
    expect(currentOptInStep(auto, { groupOpened: false, optInOpened: true })).toBe("install");
  });

  it("marks every step done once opted in", () => {
    expect(optInSteps(state({ step: "opted_in" }), none).every((s) => s.status === "done")).toBe(true);
  });
});
