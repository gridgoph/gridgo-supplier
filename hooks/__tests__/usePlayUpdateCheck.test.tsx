import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";
import { usePlayUpdateCheck } from "@/hooks/usePlayUpdateCheck";
import { loadPlayUpdate } from "@/lib/playUpdate";

// Spy on the preset's module object; a namespace import copies its exports.
const ExpoModulesCore = jest.requireMock<typeof import("expo-modules-core")>("expo-modules-core");

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { android: { versionCode: 90 } } },
}));

const native = {
  checkForUpdate: jest.fn(),
  startFlexibleUpdate: jest.fn(),
  completeUpdate: jest.fn(),
  addListener: jest.fn(),
};
let foreground: (state: AppStateStatus) => void;
let downloaded: () => void;
const removeNative = jest.fn();
const removeAppState = jest.fn();
let now: number;
const originalAppState = AppState.currentState;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  now = 1_800_000_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.replaceProperty(Platform, "OS", "android");
  AppState.currentState = "active";
  process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
  jest.spyOn(ExpoModulesCore, "requireOptionalNativeModule").mockReturnValue(native);
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: true, downloaded: false });
  native.startFlexibleUpdate.mockResolvedValue(true);
  native.completeUpdate.mockResolvedValue(null);
  native.addListener.mockImplementation((_event, listener) => {
    downloaded = listener;
    return { remove: removeNative };
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    foreground = listener;
    return { remove: removeAppState };
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  AppState.currentState = originalAppState;
  jest.restoreAllMocks();
});

it.each(["apk", "ios", "web"] as const)("never loads or calls Play on %s", async (channel) => {
  if (channel === "apk") process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "apk";
  else jest.replaceProperty(Platform, "OS", channel);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(ExpoModulesCore.requireOptionalNativeModule).not.toHaveBeenCalled();
  expect(native.checkForUpdate).not.toHaveBeenCalled();
});

it("checks on launch and starts only the flexible flow", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(native.completeUpdate).not.toHaveBeenCalled();
});

it("waits until the launch intro is ready", async () => {
  const hook = await renderHook<void, { ready: boolean }>(({ ready }) => usePlayUpdateCheck(ready), { initialProps: { ready: false } });
  expect(ExpoModulesCore.requireOptionalNativeModule).not.toHaveBeenCalled();
  await hook.rerender({ ready: true });
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
});

it("throttles foreground checks and cold launches for four hours", async () => {
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  now += 3 * 60 * 60 * 1000;
  await act(async () => foreground("active"));
  await hook.unmount();
  await renderHook(() => usePlayUpdateCheck(true));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  now += 60 * 60 * 1000;
  await act(async () => foreground("background"));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => foreground("active"));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(2);
});

it("offers one restart only after download; Later never installs", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => { downloaded(); downloaded(); });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2]!;
  expect(buttons.map((button) => button.text)).toEqual(["Later", "Restart now"]);
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => buttons[0].onPress?.());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => buttons[1].onPress?.());
  expect(native.completeUpdate).toHaveBeenCalledTimes(1);
});

it("recovers an already downloaded update without starting another download", async () => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
});

it("holds a background download prompt until the app is active", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  AppState.currentState = "background";
  await act(async () => downloaded());
  expect(Alert.alert).not.toHaveBeenCalled();
  AppState.currentState = "active";
  await act(async () => foreground("active"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
});

it.each([
  { available: false, flexibleAllowed: false, downloaded: false },
  { available: true, flexibleAllowed: false, downloaded: false },
])("silently skips unavailable or disallowed updates: %j", async (info) => {
  native.checkForUpdate.mockResolvedValue(info);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it.each(["checkForUpdate", "startFlexibleUpdate"] as const)("silently handles %s failure, including not-from-Play", async (method) => {
  native[method].mockRejectedValue(new Error("ERROR_APP_NOT_OWNED"));
  await renderHook(() => usePlayUpdateCheck(true));
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => foreground("active"));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
});

it("silently handles missing native support", async () => {
  jest.mocked(ExpoModulesCore.requireOptionalNativeModule).mockReturnValue(null);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(Alert.alert).not.toHaveBeenCalled();
});

it("silently handles restart failure and releases both listeners on unmount", async () => {
  native.completeUpdate.mockRejectedValue(new Error("install failed"));
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => downloaded());
  await act(async () => jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress?.());
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await hook.unmount();
  expect(removeNative).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalledTimes(1);
});

it("does not overlap checks while Play is answering", async () => {
  let answer!: (info: { available: boolean; flexibleAllowed: boolean; downloaded: boolean }) => void;
  native.checkForUpdate.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  await renderHook(() => usePlayUpdateCheck(true));
  now += 5 * 60 * 60 * 1000;
  await act(async () => { foreground("active"); foreground("active"); });
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => answer({ available: true, flexibleAllowed: true, downloaded: false }));
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
});

it("does not open an update flow after unmount", async () => {
  let answer!: (info: { available: boolean; flexibleAllowed: boolean; downloaded: boolean }) => void;
  native.checkForUpdate.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  await hook.unmount();
  await act(async () => answer({ available: true, flexibleAllowed: true, downloaded: false }));
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it.each(["apk", "ios", "web"] as const)("the native loader itself refuses %s", (channel) => {
  if (channel === "apk") process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "apk";
  else jest.replaceProperty(Platform, "OS", channel);
  expect(loadPlayUpdate()).toBeNull();
  expect(ExpoModulesCore.requireOptionalNativeModule).not.toHaveBeenCalled();
});
