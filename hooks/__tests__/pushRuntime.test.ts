import { Platform } from "react-native";

let mockExpoGo = true;
const mockLoadNotifications = jest.fn();
const mockSetHandler = jest.fn();
const mockRegister = jest.fn(async (_token: string, _platform: string) => undefined);
const mockPermission = jest.fn(async () => ({ status: "granted", granted: true, canAskAgain: false }));

jest.mock("expo", () => ({
  isRunningInExpoGo: () => mockExpoGo,
}));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-notifications", () => {
  mockLoadNotifications();
  return {
    setNotificationHandler: mockSetHandler,
    AndroidImportance: { HIGH: 4 },
    setNotificationChannelAsync: jest.fn(async () => undefined),
    getPermissionsAsync: mockPermission,
    requestPermissionsAsync: mockPermission,
    getDevicePushTokenAsync: jest.fn(async () => ({ data: "native-device-token" })),
  };
});
jest.mock("expo-router", () => ({}));
jest.mock("@/lib/api", () => ({
  API_REQUEST_MS: 1000,
  getAuthToken: async () => "supplier-session",
  registerDevice: (token: string, platform: string) => mockRegister(token, platform),
}));
jest.mock("@/store/session", () => ({}));
jest.mock("@/store/alerts", () => ({}));

beforeEach(() => jest.clearAllMocks());

it.each(["android", "ios"])("never evaluates remote notifications in Expo Go on %s", async (os) => {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  mockExpoGo = true;
  await jest.isolateModulesAsync(async () => {
    // The root layout imports this hook before rendering a screen.
    jest.requireActual("@/hooks/usePushNotifications");
    const { usePush } = jest.requireActual<typeof import("@/store/push")>("@/store/push");
    await usePush.getState().registerIfGranted();
    await usePush.getState().enable();
    expect(mockLoadNotifications).not.toHaveBeenCalled();
    expect(usePush.getState().supported).toBe(false);
    expect(mockRegister).not.toHaveBeenCalled();
    expect(usePush.getState().error).toBeNull();
  });
});

it.each(["android", "ios"])("keeps native push registration and the foreground handler in installed %s builds", async (os) => {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  mockExpoGo = false;
  await jest.isolateModulesAsync(async () => {
    jest.requireActual("@/hooks/usePushNotifications");
    const { usePush } = jest.requireActual<typeof import("@/store/push")>("@/store/push");
    await usePush.getState().registerIfGranted();
    expect(mockSetHandler).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith("native-device-token", os);
    expect(usePush.getState().token).toBe("native-device-token");
    expect(usePush.getState().claimed).toBe(true);
  });
});
