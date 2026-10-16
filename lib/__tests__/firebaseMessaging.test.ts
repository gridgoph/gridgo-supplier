/**
 * The iPhone build's Firebase token source (`lib/firebaseMessaging.ios.ts`).
 *
 * What it must never do is throw: Expo Go has no Firebase, and a build made
 * without GoogleService-Info.plist has the module but no configured app. Both
 * must read as "no Firebase", so push falls back to what it did before.
 */

type Loaded = typeof import("../firebaseMessaging.ios");

const getApps = jest.fn<unknown[], []>(() => []);
const messagingInstance = { name: "messaging" };
const native = {
  getMessaging: jest.fn(() => messagingInstance),
  isDeviceRegisteredForRemoteMessages: jest.fn(() => false),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
  getToken: jest.fn(async () => "fcm-ios-token"),
  onTokenRefresh: jest.fn(() => () => undefined),
};

function load(): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    jest.doMock("@react-native-firebase/app", () => ({ getApps }));
    jest.doMock("@react-native-firebase/messaging", () => native);
    loaded = require("../firebaseMessaging.ios") as Loaded;
  });
  return loaded!;
}

beforeEach(() => {
  jest.clearAllMocks();
  getApps.mockReturnValue([]);
});

it("is absent when the build has no configured Firebase app", () => {
  expect(load().getFirebaseMessaging()).toBeNull();
  expect(native.getMessaging).not.toHaveBeenCalled();
});

it("is absent, not thrown, when the native module will not load", () => {
  getApps.mockImplementation(() => {
    throw new Error("Native module RNFBAppModule not found");
  });
  expect(load().getFirebaseMessaging()).toBeNull();
});

it("registers with APNs before asking for the FCM token", async () => {
  getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
  const firebase = load().getFirebaseMessaging();

  await expect(firebase?.getToken()).resolves.toBe("fcm-ios-token");
  expect(native.registerDeviceForRemoteMessages).toHaveBeenCalledWith(messagingInstance);
  expect(native.getToken).toHaveBeenCalledWith(messagingInstance);
});

it("does not register twice once the phone already is", async () => {
  getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
  native.isDeviceRegisteredForRemoteMessages.mockReturnValue(true);
  await load().getFirebaseMessaging()?.getToken();
  expect(native.registerDeviceForRemoteMessages).not.toHaveBeenCalled();
});

it("passes token refreshes through", () => {
  getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
  const listener = jest.fn();
  load().getFirebaseMessaging()?.onTokenRefresh(listener);
  expect(native.onTokenRefresh).toHaveBeenCalledWith(messagingInstance, listener);
});
