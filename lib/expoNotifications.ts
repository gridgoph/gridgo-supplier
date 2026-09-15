import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

/** Remote push needs an installed native build; the in-app inbox works everywhere. */
export function pushSupported(os: string = Platform.OS): boolean {
  return (os === "android" || os === "ios") && !isRunningInExpoGo();
}

/**
 * Check before evaluating the module. SDK 57 installs a push-token listener
 * during import and reports Expo Go's unsupported remote push at that point;
 * catching the require is too late to prevent its startup diagnostics.
 * isRunningInExpoGo distinguishes Expo Go from installed development clients.
 */
export function getNotificationsNative(): NotificationsModule | null {
  if (!pushSupported()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as NotificationsModule;
  } catch {
    // An installed build may still be missing the native module.
    return null;
  }
}
