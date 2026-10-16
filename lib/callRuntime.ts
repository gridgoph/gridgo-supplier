/*
  The two native modules a call needs, loaded only when a call actually runs.

  `react-native-webrtc` carries the audio; `react-native-incall-manager` (the
  same project's companion) routes it to the earpiece or the speaker, keeps the
  screen awake, turns it off at the ear, and rings with the phone's own
  ringtone — which it skips in silent mode and replaces with vibration in
  vibrate mode, so a call never rings out of a phone set to silent.

  Neither exists in Expo Go. A static import would reach for the missing
  native module at load and take the app down with it (the same failure
  `store/push.ts` guards against), so both are `require`d here, inside a
  try/catch, after checking the native side is really there. Absent, calls
  say `CALLS_NEED_APP` and the rest of the app keeps working.
*/

import { isRunningInExpoGo } from "expo";
import { NativeModules, Platform } from "react-native";

import type * as WebRTC from "react-native-webrtc";
import type InCallManagerType from "react-native-incall-manager";

export type WebRTCModule = typeof WebRTC;
export type InCallManager = typeof InCallManagerType;

export type CallRuntime = { webrtc: WebRTCModule; inCall: InCallManager | null };

let cached: CallRuntime | null | undefined;

/** Both modules, or null where this build cannot place a call (Expo Go, a browser without WebRTC). */
export function loadCallRuntime(): CallRuntime | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === "web") {
    // Expo web (visual and live checks) uses the browser's own WebRTC: the same API shape.
    const browser = globalThis as unknown as Partial<WebRTCModule> & { navigator?: { mediaDevices?: unknown } };
    if (typeof browser.RTCPeerConnection === "function" && browser.navigator?.mediaDevices) {
      cached = {
        webrtc: {
          RTCPeerConnection: browser.RTCPeerConnection,
          RTCSessionDescription: browser.RTCSessionDescription,
          RTCIceCandidate: browser.RTCIceCandidate,
          mediaDevices: browser.navigator.mediaDevices,
        } as unknown as WebRTCModule,
        inCall: null,
      };
    }
    return cached;
  }
  try {
    if (isRunningInExpoGo()) return cached;
  } catch {
    // Older runtimes have no answer; the native check below decides.
  }
  if (!NativeModules.WebRTCModule) return cached;
  try {
    const webrtc = require("react-native-webrtc") as WebRTCModule;
    let inCall: InCallManager | null = null;
    if (NativeModules.InCallManager) {
      try {
        const loaded = require("react-native-incall-manager") as { default?: InCallManager } & InCallManager;
        inCall = loaded.default ?? loaded;
      } catch {
        inCall = null;
      }
    }
    cached = { webrtc, inCall };
  } catch {
    cached = null;
  }
  return cached;
}

export function callsSupported(): boolean {
  return loadCallRuntime() !== null;
}

/** Tests replace the runtime; never called by the app. */
export function setCallRuntimeForTests(runtime: CallRuntime | null | undefined): void {
  cached = runtime;
}

/** Every call into the audio companion, wrapped: routing failing must never end a call. */
export function withInCall(runtime: CallRuntime | null, use: (inCall: InCallManager) => void): void {
  if (!runtime?.inCall) return;
  try {
    use(runtime.inCall);
  } catch {
    // Audio routing is best-effort; the call itself carries on.
  }
}
