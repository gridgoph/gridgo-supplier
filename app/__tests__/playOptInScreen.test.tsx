import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import PlayOptInScreen from "@/app/play-optin";
import type { PlayOptInState } from "@/lib/api";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/** The tester steps: Gmail first (with the Google-account assertion when needed), then each group mode. */

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getPlayOptIn: jest.fn(),
  confirmPlayOptInGmail: jest.fn(),
  reportPlayOptInEvent: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const optIn = (overrides: Partial<PlayOptInState> = {}): PlayOptInState => ({
  app: "supplier",
  show: true,
  step: "confirm_gmail",
  gmailSuggestion: null,
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

const install = { platform: "android", channel: "sideload" };
const realOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  jest.spyOn(Linking, "openURL").mockClear().mockResolvedValue(true);
  useSession.setState({ user: { id: "u1", name: "Shop", role: "supplier" } as never });
  usePlayOptIn.getState().reset();
});

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
});

function events(): string[] {
  return (api.reportPlayOptInEvent as jest.Mock).mock.calls.map(([, type]) => type);
}

it("reports the tap on entry, then asks a custom address to be named a Google account", async () => {
  (api.getPlayOptIn as jest.Mock).mockResolvedValue(optIn());
  (api.confirmPlayOptInGmail as jest.Mock).mockResolvedValue(optIn({ step: "join_group", gmailSuggestion: "owner@printshop.ph" }));
  await render(<PlayOptInScreen />);
  await waitFor(() => expect(events()).toEqual(["tapped"]));

  await fireEvent.changeText(screen.getByLabelText("Gmail on Google Play"), "owner@printshop.ph");
  await fireEvent.press(screen.getByRole("button", { name: "Confirm Gmail" }));
  expect(api.confirmPlayOptInGmail).not.toHaveBeenCalled();
  expect(screen.getByText("Play admits Google accounts only.")).toBeTruthy();

  await fireEvent.press(screen.getByRole("checkbox", { name: "This is my Google account" }));
  await fireEvent.press(screen.getByRole("button", { name: "Confirm Gmail" }));
  expect(api.confirmPlayOptInGmail).toHaveBeenCalledWith(install, "owner@printshop.ph", true);
  expect(await screen.findByRole("button", { name: "Join group" })).toBeTruthy();
});

it("refuses a malformed address before sending", async () => {
  (api.getPlayOptIn as jest.Mock).mockResolvedValue(optIn());
  await render(<PlayOptInScreen />);
  await fireEvent.changeText(await screen.findByLabelText("Gmail on Google Play"), "shop@");
  await fireEvent.press(screen.getByRole("button", { name: "Confirm Gmail" }));
  expect(screen.getByText("That does not look like an email address.")).toBeTruthy();
  expect(api.confirmPlayOptInGmail).not.toHaveBeenCalled();
});

it("link mode: prefilled Gmail, join the group, open Play testing, then install from Play", async () => {
  (api.getPlayOptIn as jest.Mock).mockResolvedValue(optIn({ gmailSuggestion: "shop@gmail.com" }));
  (api.confirmPlayOptInGmail as jest.Mock).mockResolvedValue(optIn({ step: "join_group", gmailSuggestion: "shop@gmail.com" }));
  await render(<PlayOptInScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "Confirm Gmail" }));
  expect(api.confirmPlayOptInGmail).toHaveBeenCalledWith(install, "shop@gmail.com", false);

  expect(screen.getByTestId("optin-step-group-current")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Join group" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://groups.google.com/g/example-testers");

  await fireEvent.press(await screen.findByRole("button", { name: "Open Play testing" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/apps/testing/ph.gridgo.supplier");

  await fireEvent.press(await screen.findByRole("button", { name: "Open Play Store" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://play.google.com/store/apps/details?id=ph.gridgo.supplier");
  expect(events()).toEqual(["tapped", "group_opened", "optin_opened"]);
});

it("automatic mode: no group step, straight to Play testing", async () => {
  (api.getPlayOptIn as jest.Mock).mockResolvedValue(optIn({ groupMode: "automatic", groupJoinUrl: null, gmailSuggestion: "shop@gmail.com" }));
  (api.confirmPlayOptInGmail as jest.Mock).mockResolvedValue(
    optIn({ groupMode: "automatic", groupJoinUrl: null, step: "open_optin", gmailSuggestion: "shop@gmail.com" }),
  );
  await render(<PlayOptInScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "Confirm Gmail" }));
  expect(await screen.findByRole("button", { name: "Open Play testing" })).toBeTruthy();
  expect(screen.queryByText("Join the tester group")).toBeNull();
});

it("says a Google failure in words and keeps the Gmail step", async () => {
  (api.getPlayOptIn as jest.Mock).mockResolvedValue(optIn({ groupMode: "automatic", gmailSuggestion: "shop@gmail.com" }));
  const { ApiError } = jest.requireActual("@/lib/api");
  (api.confirmPlayOptInGmail as jest.Mock).mockRejectedValue(new ApiError(503, { error: "google_group_unavailable" }));
  await render(<PlayOptInScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "Confirm Gmail" }));
  expect(await screen.findByText("Google did not answer. Try again in a moment.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Confirm Gmail" })).toBeTruthy();
});

it("thanks a shop already opted in, and reports no tap", async () => {
  (api.getPlayOptIn as jest.Mock).mockResolvedValue(optIn({ show: false, optedIn: true, step: "opted_in" }));
  await render(<PlayOptInScreen />);
  expect(await screen.findByText("You're a tester")).toBeTruthy();
  expect(events()).toEqual([]);
});
