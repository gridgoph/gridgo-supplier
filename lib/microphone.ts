/*
  The microphone, asked for at the first call and never before.

  Android's own dialog is the ask; the call screen says why first ("only while
  you are on a call, never recorded"), the way `PushEnableCard` explains a
  notification ask before Android raises it. A refusal that Android will not
  ask again (`never_ask_again`) is `blocked`: only the phone's settings can
  change it, so that is the only offer made.
*/

import { Linking, PermissionsAndroid, Platform } from "react-native";

import { loadCallRuntime } from "@/lib/callRuntime";

export type MicPermission = "granted" | "prompt" | "blocked";

type BrowserPermissions = { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } };

export async function readMicPermission(): Promise<MicPermission> {
  try {
    if (Platform.OS === "web") {
      const state = (await (globalThis.navigator as BrowserPermissions | undefined)?.permissions?.query({ name: "microphone" }))?.state;
      return state === "granted" ? "granted" : state === "denied" ? "blocked" : "prompt";
    }
    if (Platform.OS === "android") {
      return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) ? "granted" : "prompt";
    }
    const runtime = loadCallRuntime();
    if (!runtime) return "prompt";
    const status = await runtime.webrtc.permissions.query({ name: "microphone" });
    return status === "granted" ? "granted" : status === "denied" ? "blocked" : "prompt";
  } catch {
    return "prompt";
  }
}

export async function requestMicPermission(): Promise<MicPermission> {
  try {
    if (Platform.OS === "web") {
      // A browser asks by opening the microphone; it is closed again at once.
      const stream = await loadCallRuntime()?.webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
      for (const track of stream?.getTracks() ?? []) track.stop();
      return stream ? "granted" : "prompt";
    }
    if (Platform.OS === "android") {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
      return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "blocked" : "prompt";
    }
    const runtime = loadCallRuntime();
    if (!runtime) return "prompt";
    return (await runtime.webrtc.permissions.request({ name: "microphone" })) ? "granted" : "blocked";
  } catch {
    return "prompt";
  }
}

export function openMicSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}
