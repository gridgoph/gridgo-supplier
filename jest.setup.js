// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();

// AsyncStorage has no native module under Jest — use the package mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Push is FCM through a native module, so there is nothing to exercise in Jest:
// the module's own surface is mocked to inert, and every rule the app applies to
// it lives in lib/push.ts and is unit-tested there directly. Permission is
// reported undetermined, which is the state a fresh phone is in — so a screen
// rendering PushEnableCard renders the ask, and no test accidentally asserts
// against a granted phone it never granted.
jest.mock("expo-notifications", () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
  })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: "android", data: "test-fcm-token" })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// The keyboard controller is native on both platforms; its own mock provides
// the components and animated values so form screens can render under Jest.
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);
