import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

// The notes this build carries, as a fixture (never the repository's own).
jest.mock("@/store/whatsNewHistory", () => ({
  ...jest.requireActual("@/store/whatsNewHistory"),
  bundledHistory: () => [
    { version: "1.0.84", kind: "feature", notes: ["A guided tour for new shops"] },
  ],
}));

import { AppUpdateNotices } from "@/components/AppUpdateNotices";
import { DOWNLOAD_URL, type LatestRelease } from "@/lib/appUpdate";
import { useAppUpdate } from "@/store/appUpdate";

const latest: LatestRelease = {
  versionCode: 90,
  versionName: "1.0.90",
  publishedAt: null,
  apkBytes: null,
  whatsNew: ["What's new in every update", "Replay the tour from Account"],
};

beforeEach(() => {
  jest.restoreAllMocks();
  useAppUpdate.setState({
    installed: { versionCode: 84, versionName: "1.0.84" },
    latest: null,
    offer: null,
    snooze: null,
    updatedNotice: null,
  });
});

it("draws nothing when the phone is current and nothing just landed", async () => {
  await render(<AppUpdateNotices />);
  expect(screen.queryByTestId("app-update-notices")).toBeNull();
});

it("keeps a newer version and its What's new on screen, after Later too", async () => {
  // "Later" cleared the offer and wrote a snooze; the card does not care.
  useAppUpdate.setState({ latest, snooze: { versionCode: 90, dayKey: "2026-09-29" } });
  await render(<AppUpdateNotices />);

  expect(screen.getByText("Version 1.0.90 is ready")).toBeTruthy();
  expect(screen.getByText(/This phone has 1\.0\.84/)).toBeTruthy();
  expect(screen.getByText("What's new in 1.0.90")).toBeTruthy();
  expect(screen.getByText("Replay the tour from Account")).toBeTruthy();
});

it("takes the same download as the sheet", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  useAppUpdate.setState({ latest });
  await render(<AppUpdateNotices />);

  await fireEvent.press(screen.getByRole("button", { name: "Update now" }));
  expect(open).toHaveBeenCalledWith(DOWNLOAD_URL);
});

it("names the download page when the link will not open", async () => {
  jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No activity"));
  useAppUpdate.setState({ latest });
  await render(<AppUpdateNotices />);

  await fireEvent.press(screen.getByRole("button", { name: "Update now" }));
  expect(await screen.findByText(/gridgo\.talasora\.com\/download/)).toBeTruthy();
});

it("says what the build that just landed brought, offline, until dismissed", async () => {
  useAppUpdate.setState({
    updatedNotice: { build: { versionCode: 84, versionName: "1.0.84" }, at: Date.UTC(2026, 8, 29, 2) },
  });
  await render(<AppUpdateNotices />);

  expect(screen.getByText("Updated to version 1.0.84")).toBeTruthy();
  expect(screen.getByText("What's new in 1.0.84")).toBeTruthy();
  expect(screen.getByText("A guided tour for new shops")).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Dismiss: Updated to version 1.0.84" }));
  await waitFor(() => expect(screen.queryByText("Updated to version 1.0.84")).toBeNull());
  expect(useAppUpdate.getState().updatedNotice).toBeNull();
});

it("drops the Updated card once the phone runs another build", async () => {
  useAppUpdate.setState({
    updatedNotice: { build: { versionCode: 80, versionName: "1.0.80" }, at: 0 },
  });
  await render(<AppUpdateNotices />);
  expect(screen.queryByText(/Updated to version/)).toBeNull();
});
