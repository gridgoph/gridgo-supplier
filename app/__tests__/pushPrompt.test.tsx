import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

import { router } from "expo-router";

import PushPromptSheet from "@/app/push-prompt";
import * as api from "@/lib/api";
import { PUSH_CHANNEL_ID } from "@/lib/push";
import { usePush } from "@/store/push";
import { usePushPrompt } from "@/store/pushPrompt";

/**
 * The explainer: what notifications are for, then the OS dialog only on a
 * tap. A phone Android will no longer ask is sent to its own settings.
 */

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const granted = { status: "granted", granted: true, canAskAgain: true };

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  api.setToken("session-token");
  usePush.setState({
    supported: true,
    permission: "undetermined",
    token: null,
    claimed: false,
    busy: false,
    error: null,
  });
  usePushPrompt.setState({ lastOfferedAt: Date.now(), hydrated: true, sheetOpen: true });
});

afterEach(() => {
  api.setToken(null);
});

it("says what will arrive before anything is asked", async () => {
  await render(<PushPromptSheet />);

  expect(screen.getByText("Know when your shop is needed")).toBeTruthy();
  expect(screen.getByText("Job offers")).toBeTruthy();
  expect(screen.getByText("Payouts")).toBeTruthy();
  expect(screen.getByText("Pickups")).toBeTruthy();
  expect(screen.getByText("Production reminders")).toBeTruthy();
  expect(screen.getByText("Not now")).toBeTruthy();
  // Opening the sheet is not asking.
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
});

it("closes on Not now without raising the dialog", async () => {
  await render(<PushPromptSheet />);
  fireEvent.press(screen.getByText("Not now"));

  expect(router.back).toHaveBeenCalled();
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
});

it("frees the sheet slot when it leaves, however it leaves", async () => {
  const view = await render(<PushPromptSheet />);
  await view.unmount();
  expect(usePushPrompt.getState().sheetOpen).toBe(false);
});

it("opens the phone's notification settings for a blocked phone", async () => {
  usePush.setState({ permission: "blocked" });
  const sendIntent = jest.spyOn(Linking, "sendIntent").mockResolvedValue(undefined);
  await render(<PushPromptSheet />);

  expect(screen.getByText("Notifications are off for GRIDGO")).toBeTruthy();
  fireEvent.press(screen.getByText("Open phone settings"));

  await waitFor(() =>
    expect(sendIntent).toHaveBeenCalledWith("android.settings.APP_NOTIFICATION_SETTINGS", [
      { key: "android.provider.extra.APP_PACKAGE", value: expect.any(String) },
    ]),
  );
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  sendIntent.mockRestore();
});

it("falls back to the app's settings page when Android refuses the intent", async () => {
  usePush.setState({ permission: "blocked" });
  const sendIntent = jest.spyOn(Linking, "sendIntent").mockRejectedValue(new Error("no activity"));
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await render(<PushPromptSheet />);

  fireEvent.press(screen.getByText("Open phone settings"));
  await waitFor(() => expect(openSettings).toHaveBeenCalled());
  sendIntent.mockRestore();
  openSettings.mockRestore();
});

// Last on purpose: this press drives async store updates outside React.
it("creates the channels, asks, and registers the phone on a yes", async () => {
  mocked.requestPermissionsAsync.mockResolvedValue(granted as never);
  mocked.getPermissionsAsync.mockResolvedValue(granted as never);
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  await render(<PushPromptSheet />);

  fireEvent.press(screen.getByText("Turn on notifications"));

  await waitFor(() => expect(register).toHaveBeenCalledWith("test-fcm-token", "android"));
  const channel = mocked.setNotificationChannelAsync.mock.invocationCallOrder[0];
  const ask = mocked.requestPermissionsAsync.mock.invocationCallOrder[0];
  expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(PUSH_CHANNEL_ID, expect.anything());
  expect(channel).toBeLessThan(ask);
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  register.mockRestore();
});
