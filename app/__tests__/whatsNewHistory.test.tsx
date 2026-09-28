import { render, screen } from "@testing-library/react-native";

import WhatsNewScreen from "@/app/whats-new";
import { WHATS_NEW_HISTORY_COPY } from "@/lib/whatsNewHistory";
import { useAppUpdate } from "@/store/appUpdate";
import { useWhatsNewHistory } from "@/store/whatsNewHistory";

// A fixture history, never the repository's WHATS_NEW.md: CI rewrites that on
// every release, and a test reading it would break the release that did.
const mockConfig: { version: string; extra: { whatsNewHistory: unknown } } = {
  version: "1.0.171",
  extra: { whatsNewHistory: [] },
};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  mockConfig.extra.whatsNewHistory = [
    { version: "1.0.166", kind: "fix", notes: ["Saving reliably"] },
    { version: "1.0.171", kind: "improvement", notes: ["Chat stays in view"] },
    { version: "1.0.158", kind: "feature", notes: ["Progress photos"] },
  ];
  useWhatsNewHistory.setState({ status: "idle", online: [], loadedAt: null });
  useAppUpdate.setState({ installed: { versionCode: 171, versionName: "1.0.171" } });
});

it("lists every release newest first, labelled, with a newer one read online", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [
      {
        tag_name: "v1.0.180",
        body: "## What's new\n\nRelease type: New feature\n\n- A guided tour\n\n## Build\n",
      },
      { tag_name: "v1.0.171", body: "## What's new\n\n- Online copy of 171\n" },
    ],
  });

  await render(<WhatsNewScreen />);

  expect(await screen.findByText("1.0.180")).toBeTruthy();
  const order = screen.getAllByTestId(/^release:/).map((row) => row.props.testID);
  expect(order).toEqual(["release:1.0.180", "release:1.0.171", "release:1.0.166", "release:1.0.158"]);

  expect(
    screen.getByLabelText("Version 1.0.180, New feature, Not installed yet. A guided tour"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Version 1.0.171, Improvement, On this phone. Chat stays in view"),
  ).toBeTruthy();
  expect(screen.getByLabelText("Version 1.0.166, Fix. Saving reliably")).toBeTruthy();
  // The bundled copy of a version stands over the online one.
  expect(screen.queryByText("Online copy of 171")).toBeNull();
  expect(
    screen.getByText("This phone has version 1.0.171. Every release is here, newest first."),
  ).toBeTruthy();
  expect(screen.queryByText(/You're offline/)).toBeNull();
});

it("shows the history this version carries, and says calmly that it is offline", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));

  await render(<WhatsNewScreen />);

  expect(await screen.findByText(WHATS_NEW_HISTORY_COPY.offline)).toBeTruthy();
  expect(screen.getAllByTestId(/^release:/).map((row) => row.props.testID)).toEqual([
    "release:1.0.171",
    "release:1.0.166",
    "release:1.0.158",
  ]);
  expect(screen.getByText("Chat stays in view")).toBeTruthy();
  expect(screen.getByText("On this phone")).toBeTruthy();
  expect(useWhatsNewHistory.getState().status).toBe("offline");
});

it("says GitHub could not be checked when it answers with something else", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

  await render(<WhatsNewScreen />);

  expect(await screen.findByText(WHATS_NEW_HISTORY_COPY.unavailable)).toBeTruthy();
  expect(screen.getAllByTestId(/^release:/)).toHaveLength(3);
});

it("says notes are coming when no release has any yet", async () => {
  mockConfig.extra.whatsNewHistory = [];
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));

  await render(<WhatsNewScreen />);

  expect(await screen.findByText(WHATS_NEW_HISTORY_COPY.empty)).toBeTruthy();
  expect(screen.queryAllByTestId(/^release:/)).toHaveLength(0);
});
