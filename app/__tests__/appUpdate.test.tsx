import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => mockNavigation,
}));

import { router } from "expo-router";

import AppUpdateSheet from "@/app/app-update";
import { DOWNLOAD_URL, type LatestRelease } from "@/lib/appUpdate";
import {
  checkForUpdate,
  closeUpdateSheet,
  recordLaunch,
  useAppUpdate,
} from "@/store/appUpdate";

const installed = { versionCode: 80, versionName: "1.0.80" };
const latest: LatestRelease = {
  versionCode: 84,
  versionName: "1.0.84",
  publishedAt: "2026-09-23T13:15:55Z",
  apkBytes: 130409988,
};
const morning = new Date(2026, 8, 24, 9, 0);

beforeEach(() => {
  jest.clearAllMocks();
  useAppUpdate.setState({
    lastSeenVersionCode: null,
    snooze: null,
    hydrated: true,
    lastCheckedAt: null,
    offer: null,
    completed: null,
    sheetOpen: false,
  });
});

describe("the update check", () => {
  it("queues an offer for a newer release", async () => {
    await checkForUpdate(installed, "launch", morning, async () => latest);
    expect(useAppUpdate.getState().offer).toEqual({ installed, latest });
  });

  it("queues nothing when the check fails", async () => {
    await checkForUpdate(installed, "launch", morning, async () => null);
    expect(useAppUpdate.getState().offer).toBeNull();
  });

  it("does not ask GitHub again on a quick return to the foreground", async () => {
    const fetchLatest = jest.fn(async () => latest);
    await checkForUpdate(installed, "launch", morning, fetchLatest);
    const later = new Date(morning.getTime() + 30 * 60 * 1000);
    await checkForUpdate(installed, "foreground", later, fetchLatest);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });

  it("holds a 'Later' for the rest of the day, then asks again", async () => {
    await checkForUpdate(installed, "launch", morning, async () => latest);
    closeUpdateSheet({ kind: "offer", versionCode: 84 }, morning);
    expect(useAppUpdate.getState().offer).toBeNull();

    const evening = new Date(2026, 8, 24, 20, 0);
    await checkForUpdate(installed, "launch", evening, async () => latest);
    expect(useAppUpdate.getState().offer).toBeNull();

    const tomorrow = new Date(2026, 8, 25, 8, 0);
    await checkForUpdate(installed, "launch", tomorrow, async () => latest);
    expect(useAppUpdate.getState().offer?.latest.versionCode).toBe(84);
  });
});

describe("the first launch after an upgrade", () => {
  it("says so once", () => {
    useAppUpdate.setState({ lastSeenVersionCode: 80 });
    recordLaunch({ versionCode: 84, versionName: "1.0.84" });
    expect(useAppUpdate.getState().completed).toEqual({ versionCode: 84, versionName: "1.0.84" });
    expect(useAppUpdate.getState().lastSeenVersionCode).toBe(84);

    recordLaunch({ versionCode: 84, versionName: "1.0.84" });
    expect(useAppUpdate.getState().completed).toBeNull();
  });

  it("says nothing on a first install", () => {
    recordLaunch({ versionCode: 84, versionName: "1.0.84" });
    expect(useAppUpdate.getState().completed).toBeNull();
  });

  it("closing the note leaves an offer queued behind it untouched", () => {
    useAppUpdate.setState({
      completed: { versionCode: 83, versionName: "1.0.83" },
      offer: { installed, latest },
      sheetOpen: true,
    });
    closeUpdateSheet({ kind: "completed" }, morning);
    expect(useAppUpdate.getState()).toMatchObject({
      completed: null,
      snooze: null,
      sheetOpen: false,
    });
    expect(useAppUpdate.getState().offer).not.toBeNull();
  });
});

describe("App update sheet", () => {
  it("names both versions and the download size", async () => {
    useAppUpdate.setState({ offer: { installed, latest } });
    await render(<AppUpdateSheet />);

    expect(screen.getByText("A new version of GRIDGO is ready")).toBeTruthy();
    expect(screen.getByText("1.0.80")).toBeTruthy();
    expect(screen.getByText("1.0.84")).toBeTruthy();
    expect(screen.getByText("130 MB")).toBeTruthy();
  });

  it("opens the APK download on Update now", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    useAppUpdate.setState({ offer: { installed, latest } });
    await render(<AppUpdateSheet />);

    await fireEvent.press(screen.getByRole("button", { name: "Update now" }));

    expect(open).toHaveBeenCalledWith(DOWNLOAD_URL);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    // Not a snooze: coming back without installing is asked again later.
    expect(useAppUpdate.getState()).toMatchObject({ offer: null, snooze: null });
  });

  it("says where to go when the download will not open", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No activity"));
    useAppUpdate.setState({ offer: { installed, latest } });
    await render(<AppUpdateSheet />);

    await fireEvent.press(screen.getByRole("button", { name: "Update now" }));

    expect(await screen.findByText(/gridgo\.talasora\.com\/download/)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("puts the version off on Later", async () => {
    useAppUpdate.setState({ offer: { installed, latest } });
    await render(<AppUpdateSheet />);

    await fireEvent.press(screen.getByRole("button", { name: "Later" }));

    expect(useAppUpdate.getState().snooze?.versionCode).toBe(84);
    expect(router.back).toHaveBeenCalled();
  });

  it("confirms a completed update", async () => {
    useAppUpdate.setState({ completed: { versionCode: 84, versionName: "1.0.84" } });
    await render(<AppUpdateSheet />);

    expect(screen.getByText("Update completed")).toBeTruthy();
    expect(screen.getByText("You're on 1.0.84.")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(useAppUpdate.getState().completed).toBeNull();
  });
});
