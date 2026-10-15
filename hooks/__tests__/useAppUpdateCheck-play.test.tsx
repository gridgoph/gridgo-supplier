import { renderHook, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: "storeClient", Bare: "bare", Standalone: "standalone" },
  default: {
    executionEnvironment: "storeClient",
    expoConfig: { version: "1.0.0", android: { versionCode: 1 }, extra: {} },
  },
}));

import { router } from "expo-router";

import { useAppUpdateCheck } from "@/hooks/useAppUpdateCheck";
import { useAppUpdate } from "@/store/appUpdate";

const fetchMock = jest.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ tag_name: "v1.0.95", draft: false, prerelease: false, assets: [] }),
}));

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  global.fetch = fetchMock as unknown as typeof fetch;
  // Expo Go, made a build by the development override.
  process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE = "90";
  useAppUpdate.setState({
    lastSeenVersionCode: 80,
    snooze: null,
    latest: null,
    updatedNotice: null,
    installed: null,
    offersUpdates: true,
    hydrated: true,
    lastCheckedAt: null,
    checking: false,
    offer: null,
    completed: null,
    sheetOpen: false,
  });
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE;
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  fetchMock.mockClear();
  jest.restoreAllMocks();
});

describe("the update check, by distribution", () => {
  // First: a launch is recorded once per JS runtime (`launchRecorded`).
  it("never reads GitHub or offers the APK in a Google Play build", async () => {
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
    renderHook(() => useAppUpdateCheck(true));
    await waitFor(() => expect(useAppUpdate.getState().installed).not.toBeNull());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(useAppUpdate.getState()).toMatchObject({
      installed: { versionCode: 90, versionName: "1.0.90" },
      offersUpdates: false,
      offer: null,
      completed: null,
      updatedNotice: null,
    });
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] off: a Google Play build, and Play installs its own updates",
    );
  });

  it("reads GitHub in a side-load build", async () => {
    renderHook(() => useAppUpdateCheck(false));
    await waitFor(() => expect(useAppUpdate.getState().offer?.latest.versionCode).toBe(95));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAppUpdate.getState().offersUpdates).toBe(true);
  });
});
