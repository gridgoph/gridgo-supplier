import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { HomeTesterSlot } from "@/components/HomeTesterSlot";
import type { TesterProgramState } from "@/lib/api";
import { useSession } from "@/store/session";
import { usePlayOptIn } from "@/store/playOptIn";
import { useTesterProgram } from "@/store/testerProgram";

/** Home's tester line: nothing for a non-tester, Day N and the streak for a tester. */

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    reportTesterFeedback: jest.fn(() => Promise.resolve()),
    reportPlayOptInEvent: jest.fn(() => Promise.resolve()),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const enrolled = (overrides: object = {}): TesterProgramState => ({
  enrolled: true,
  app: "supplier",
  day: 3,
  streak: 3,
  checkedInToday: true,
  runComplete: false,
  stopped: false,
  manilaDate: "2026-11-07",
  nudge: null,
  ...overrides,
});

function signedInWith(program: TesterProgramState | null, extra: object = {}) {
  useSession.setState({ user: { id: "u1", name: "Lovis", role: "supplier" } as never });
  useTesterProgram.setState({ owner: "u1", program, readAt: Date.parse("2026-11-07T12:00:00Z"), held: null, ...extra });
}

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

afterEach(() => {
  usePlayOptIn.getState().reset();
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  useTesterProgram.setState({ owner: null, program: null, held: null, checkingIn: false, checkInFailed: false });
});

it("draws nothing for an account that is not enrolled", async () => {
  signedInWith({ enrolled: false });
  await render(<HomeTesterSlot />);
  expect(screen.toJSON()).toBeNull();
});

it("shows Day N of 14, the streak and the done state once today is in", async () => {
  signedInWith(enrolled());
  await render(<HomeTesterSlot />);
  expect(screen.getByText("Day 3 of 14")).toBeTruthy();
  expect(screen.getByText("3-day streak")).toBeTruthy();
  expect(screen.getByText("Done for today")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  expect(screen.getAllByTestId("tester-cell-done")).toHaveLength(3);
});

it("offers Check in with today's square open when the open could not check in", async () => {
  signedInWith(enrolled({ day: 4, checkedInToday: false }));
  await render(<HomeTesterSlot />);
  expect(screen.getByText("Day 4 of 14")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
  expect(screen.getAllByTestId("tester-cell-today")).toHaveLength(1);
});

it("puts GRIDGO's feedback ask in the card's place and reports it shown", async () => {
  signedInWith(enrolled({ nudge: { trigger: "streak_3" } }));
  await render(<HomeTesterSlot />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dismiss the feedback request" })).toBeTruthy();
  expect(screen.queryByText("Day 3 of 14")).toBeNull();
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("shown", "streak_3");
});

it("keeps a dismissed card closed and shows the check-in again", async () => {
  const shownAt = Date.parse("2026-11-07T10:00:00Z");
  signedInWith(enrolled({ nudge: { trigger: "completed_order" } }), {
    held: { userId: "u1", trigger: "streak_3", shownAt, closed: true },
  });
  await render(<HomeTesterSlot />);
  expect(screen.queryByText("Help us launch")).toBeNull();
  expect(screen.getByText("Day 3 of 14")).toBeTruthy();
});

it("draws nothing before GRIDGO answers", async () => {
  signedInWith(null);
  await render(<HomeTesterSlot className="mt-6" />);
  expect(screen.toJSON()).toBeNull();
});

it("never draws one account's answer for another", async () => {
  useSession.setState({ user: { id: "u2", name: "Other", role: "supplier" } as never });
  useTesterProgram.setState({ owner: "u1", program: enrolled() });
  await render(<HomeTesterSlot className="mt-6" />);
  expect(screen.toJSON()).toBeNull();
});

it("says thank you on the fourteenth day with a full meter", async () => {
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true }));
  await render(<HomeTesterSlot />);
  expect(screen.getByText("All 14 days")).toBeTruthy();
  expect(screen.getAllByTestId("tester-cell-done")).toHaveLength(14);
});

it("lets the shop close the feedback card", async () => {
  signedInWith(enrolled({ nudge: { trigger: "streak_10" } }));
  await render(<HomeTesterSlot />);
  await fireEvent.press(screen.getByRole("button", { name: "Dismiss the feedback request" }));
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("dismissed", "streak_10");
  expect(screen.queryByText("Help us launch")).toBeNull();
  expect(screen.getByText("Day 3 of 14")).toBeTruthy();
});

it("drops a held feedback card once the app is production approved", async () => {
  signedInWith(enrolled({ stopped: true, nudge: null }), {
    held: { userId: "u1", trigger: "streak_3", shownAt: Date.parse("2026-11-07T11:00:00Z"), closed: false },
  });
  await render(<HomeTesterSlot />);
  expect(screen.queryByText("Help us launch")).toBeNull();
  // Approval ends the program: no check-in card either.
  expect(screen.toJSON()).toBeNull();
});

it("keeps the fourteenth-day feedback ask on a completed run", async () => {
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, nudge: { trigger: "streak_14" } }));
  await render(<HomeTesterSlot />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
});

it("drops a held day-14 feedback card once a completed run is production approved", async () => {
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, productionApproved: true, nudge: null }), {
    held: { userId: "u1", trigger: "streak_14", shownAt: Date.parse("2026-11-07T11:00:00Z"), closed: false },
  });
  await render(<HomeTesterSlot />);
  expect(screen.queryByText("Help us launch")).toBeNull();
});

it("keeps a held day-14 card on a completed run that is not approved, or from a GRIDGO without the field", async () => {
  const held = { userId: "u1", trigger: "streak_14" as const, shownAt: Date.parse("2026-11-07T11:00:00Z"), closed: false };
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, productionApproved: false, nudge: null }), { held });
  await render(<HomeTesterSlot />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, nudge: null }), { held });
  await render(<HomeTesterSlot />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
});

describe("Play opt-in card", () => {
  const optIn = (overrides: object = {}) => ({
    app: "supplier",
    show: true,
    step: "confirm_gmail" as const,
    gmailSuggestion: "shop@gmail.com",
    groupMode: "link" as const,
    campaignEnabled: true,
    optInUrl: "https://play.google.com/apps/testing/ph.gridgo.supplier",
    groupJoinUrl: "https://groups.google.com/g/example-testers",
    target: 12,
    optedIn: false,
    dismissCount: 0,
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.supplier",
    ...overrides,
  });

  function offered(os: string, overrides: object = {}) {
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });
    signedInWith({ enrolled: false });
    usePlayOptIn.setState({ owner: "u1", state: optIn(overrides), closed: false, shownSent: false });
  }

  it("asks an Android APK shop and reports it shown once drawn", async () => {
    offered("android");
    await render(<HomeTesterSlot />);
    expect(screen.getByText("Help us launch GRIDGO on Play")).toBeTruthy();
    expect(screen.getByText("Become a tester")).toBeTruthy();
    expect(api.reportPlayOptInEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "shown");
    fireEvent.press(screen.getByRole("button", { name: "Help us launch GRIDGO on Play, become a tester." }));
    expect(mockPush).toHaveBeenCalledWith("/play-optin?from=card");
  });

  it("draws nothing on iOS, even when GRIDGO says show", async () => {
    offered("ios");
    await render(<HomeTesterSlot />);
    expect(screen.toJSON()).toBeNull();
  });

  it("draws nothing on the Play build", async () => {
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
    offered("android");
    await render(<HomeTesterSlot />);
    expect(screen.toJSON()).toBeNull();
  });

  it("draws nothing once GRIDGO stops showing it or after three closes", async () => {
    offered("android", { show: false });
    await render(<HomeTesterSlot />);
    expect(screen.toJSON()).toBeNull();
    offered("android", { dismissCount: 3 });
    await render(<HomeTesterSlot />);
    expect(screen.toJSON()).toBeNull();
  });

  it("closes with the cross and reports the close once", async () => {
    offered("android", { dismissCount: 2 });
    await render(<HomeTesterSlot />);
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(api.reportPlayOptInEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "dismissed");
    expect(screen.toJSON()).toBeNull();
  });

  it("asks an enrolled APK tester first, in the check-in card's place", async () => {
    offered("android");
    signedInWith(enrolled());
    await render(<HomeTesterSlot />);
    expect(screen.getByText("Become a tester")).toBeTruthy();
    expect(screen.queryByText("Day 3 of 14")).toBeNull();
  });

  it("asks before a due feedback card, which is not reported shown meanwhile", async () => {
    offered("android");
    signedInWith(enrolled({ nudge: { trigger: "streak_3" } }));
    (api.reportTesterFeedback as jest.Mock).mockClear();
    await render(<HomeTesterSlot />);
    expect(screen.getByText("Become a tester")).toBeTruthy();
    expect(screen.queryByText("Leave feedback on Google Play")).toBeNull();
    expect(api.reportTesterFeedback).not.toHaveBeenCalled();
  });

  it("hands back to the check-in once the ask is closed", async () => {
    offered("android");
    signedInWith(enrolled());
    await render(<HomeTesterSlot />);
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByText("Day 3 of 14")).toBeTruthy();
  });

  it("hands over to the check-in once the Play build has opted in", async () => {
    offered("android", { show: false, optedIn: true, step: "opted_in" });
    signedInWith(enrolled({ day: 1, streak: 1 }));
    await render(<HomeTesterSlot />);
    expect(screen.getByText("Day 1 of 14")).toBeTruthy();
    expect(screen.queryByText("Become a tester")).toBeNull();
  });
});
