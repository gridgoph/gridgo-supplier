import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import * as api from "@/lib/api";
import { PRODUCTION_NUDGE_SOUND, PUSH_CHANNEL_ID, PUSH_PRODUCTION_NUDGE_CHANNEL_ID } from "@/lib/push";
import { usePush, pushSupported, serializeDeviceMutation } from "@/store/push";
import { useSession } from "@/store/session";

/**
 * The registration lifecycle, against a mocked native module (jest.setup.js).
 *
 * The rules being checked are the ones that fail invisibly on a real phone:
 * a device registered before permission exists, a rotated token that never
 * reaches the server, and a sign-out that leaves the previous shop's job
 * offers arriving on the lock screen.
 */

const granted = { status: "granted", granted: true, canAskAgain: false };
const undetermined = { status: "undetermined", granted: false, canAskAgain: true };
const blocked = { status: "denied", granted: false, canAskAgain: false };

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const supplierUser = {
  id: "u1",
  email: "shop@example.ph",
  name: "Shop Owner",
  role: "supplier" as const,
  supplierName: "Demo Print Shop",
};

/**
 * This file is about Android.
 *
 * The jest-expo preset runs as iOS, and two of the rules below are Android's
 * alone: the notification channel, and the `platform` value that reaches
 * `POST /devices`. Pinning the platform is what lets them be asserted at all.
 */
beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  usePush.setState({
    supported: true,
    permission: "unknown",
    token: null,
    claimed: false,
    busy: false,
    error: null,
  });
  api.setToken("session-token");
  mocked.getPermissionsAsync.mockResolvedValue(undetermined as never);
  mocked.requestPermissionsAsync.mockResolvedValue(undetermined as never);
  mocked.getDevicePushTokenAsync.mockResolvedValue({
    type: "android",
    data: "fcm-token-a7c8d3f1",
  } as never);
});

afterEach(() => {
  api.setToken(null);
});

describe("pushSupported", () => {
  it("covers the two platforms this app ships to", () => {
    expect(pushSupported("android")).toBe(true);
    expect(pushSupported("ios")).toBe(true);
  });

  it("leaves web out — browser push needs a service worker this MVP has not shipped", () => {
    expect(pushSupported("web")).toBe(false);
  });
});

describe("registerIfGranted", () => {
  it("registers the FCM token against the shop once permission is granted", async () => {
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({
      device: {
        id: "dev_1",
        userId: "user_supplier",
        platform: "android",
        tokenTail: "a7c8d3f1",
        createdAt: "2026-08-11T02:00:00.000Z",
        updatedAt: "2026-08-11T02:00:00.000Z",
      },
      created: true,
      reassigned: false,
    });

    await usePush.getState().registerIfGranted();

    expect(register).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android");
    expect(usePush.getState().token).toBe("fcm-token-a7c8d3f1");
    expect(usePush.getState().error).toBeNull();
    register.mockRestore();
  });

  it("does not register a phone that has not granted permission", async () => {
    const register = jest.spyOn(api, "registerDevice");
    await usePush.getState().registerIfGranted();
    expect(register).not.toHaveBeenCalled();
    expect(usePush.getState().permission).toBe("undetermined");
    register.mockRestore();
  });

  it("registers unclaimed when nobody is signed in", async () => {
    // A shop that installs GRIDGO and never signs in still has to hear "there
    // is a new version". No bearer exists, so the phone goes on the unclaimed
    // list and signing in claims the same token.
    api.setToken(null);
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const claimed = jest.spyOn(api, "registerDevice");
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);

    await usePush.getState().registerIfGranted();

    expect(unclaimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android");
    expect(claimed).not.toHaveBeenCalled();
    expect(usePush.getState().token).toBe("fcm-token-a7c8d3f1");
    expect(usePush.getState().claimed).toBe(false);
    claimed.mockRestore();
    unclaimed.mockRestore();
  });

  it("claims the same token the moment a shop signs in", async () => {
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    usePush.setState({ permission: "granted", token: "fcm-token-a7c8d3f1", claimed: false });
    const claimed = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await usePush.getState().registerIfGranted();

    expect(claimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android");
    expect(usePush.getState().claimed).toBe(true);
    claimed.mockRestore();
  });

  it("says nothing when unauthenticated registration is not deployed yet", async () => {
    // The route is provisional. A deployment without it answers 401, and that
    // is GRIDGO's schedule, not something a shop did — so no error is set and
    // nothing is shown. The phone registers for real at the next sign-in.
    api.setToken(null);
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    for (const status of [401, 403, 404, 405]) {
      usePush.setState({ token: null, claimed: false, error: null });
      const unclaimed = jest
        .spyOn(api, "registerDeviceUnclaimed")
        .mockRejectedValue(new api.ApiError(status, { error: "unauthorized" }));

      await expect(usePush.getState().registerIfGranted()).resolves.toBeUndefined();

      expect(usePush.getState().error).toBeNull();
      expect(usePush.getState().token).toBeNull();
      expect(usePush.getState().busy).toBe(false);
      unclaimed.mockRestore();
    }
  });

  it("creates the channel before reading permission", async () => {
    // Android 8+ drops a message naming a channel that does not exist, and the
    // Android 13 dialog does not appear until one does. Ordering is the whole
    // point, so it is asserted rather than assumed.
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await usePush.getState().registerIfGranted();

    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      PUSH_CHANNEL_ID,
      expect.objectContaining({ name: expect.any(String) }),
    );
    const channelOrder = mocked.setNotificationChannelAsync.mock.invocationCallOrder[0];
    const nudgeOrder = mocked.setNotificationChannelAsync.mock.invocationCallOrder[1];
    const permissionOrder = mocked.getPermissionsAsync.mock.invocationCallOrder[0];
    expect(channelOrder).toBeLessThan(permissionOrder);
    expect(nudgeOrder).toBeLessThan(permissionOrder);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      PUSH_PRODUCTION_NUDGE_CHANNEL_ID,
      expect.objectContaining({ sound: PRODUCTION_NUDGE_SOUND, importance: Notifications.AndroidImportance.HIGH }),
    );
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      PUSH_CHANNEL_ID,
      expect.not.objectContaining({ sound: PRODUCTION_NUDGE_SOUND }),
    );
  });

  it("survives a native module that throws — Expo Go has no remote push at all", async () => {
    // Android push was removed from Expo Go in SDK 53 and the module throws
    // rather than warns. That must cost push and nothing else.
    mocked.getPermissionsAsync.mockRejectedValue(new Error("Expo Go does not support push"));
    await expect(usePush.getState().registerIfGranted()).resolves.toBeUndefined();
    expect(usePush.getState().permission).toBe("unknown");
  });

  it("keeps a failed registration to itself", async () => {
    // A sign-in must not fail because FCM did.
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const register = jest
      .spyOn(api, "registerDevice")
      .mockRejectedValue(new api.ApiError(400, { error: "device_token_too_long" }));

    await expect(usePush.getState().registerIfGranted()).resolves.toBeUndefined();

    // Plain language, never the raw code: this string can reach the card.
    expect(usePush.getState().error).not.toMatch(/device_token_too_long/);
    expect(usePush.getState().error).toMatch(/still arrive in the app/i);
    expect(usePush.getState().busy).toBe(false);
    register.mockRestore();
  });
});

describe("enable", () => {
  it("raises the dialog and registers when the shop says yes", async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(granted as never);
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await expect(usePush.getState().enable()).resolves.toBe(true);

    expect(mocked.requestPermissionsAsync).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android");
    register.mockRestore();
  });

  it("records a refusal as blocked and registers nothing", async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(blocked as never);
    const register = jest.spyOn(api, "registerDevice");

    await expect(usePush.getState().enable()).resolves.toBe(false);

    expect(usePush.getState().permission).toBe("blocked");
    expect(usePush.getState().busy).toBe(false);
    expect(register).not.toHaveBeenCalled();
    register.mockRestore();
  });
});

describe("adoptToken", () => {
  it("re-registers when Firebase reissues the token", async () => {
    // The silent failure: a rotated token stops delivering and nothing looks
    // wrong until somebody notices they stopped being offered work.
    usePush.setState({ permission: "granted", token: "old-token" });
    mocked.getDevicePushTokenAsync.mockResolvedValue({
      type: "android",
      data: "rotated-token",
    } as never);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await usePush.getState().adoptToken("rotated-token");

    expect(register).toHaveBeenCalledWith("rotated-token", "android");
    register.mockRestore();
  });

  it("ignores a rotation event for the token it already holds", async () => {
    usePush.setState({ permission: "granted", token: "same-token" });
    const register = jest.spyOn(api, "registerDevice");
    await usePush.getState().adoptToken("same-token");
    expect(register).not.toHaveBeenCalled();
    register.mockRestore();
  });
});

describe("signing out", () => {
  it("sends the device token with the sign-out so the phone stops receiving", async () => {
    // It has to ride along with logout: afterwards the bearer token is dead,
    // so POST /devices/unregister could no longer authenticate and this phone
    // would keep waking up for the previous shop's job offers.
    usePush.setState({ token: "fcm-token-a7c8d3f1", claimed: true, permission: "granted" });
    useSession.setState({ user: supplierUser });
    const logout = jest.spyOn(api, "logout").mockResolvedValue(undefined);
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);

    await useSession.getState().logout();

    expect(logout).toHaveBeenCalledWith("fcm-token-a7c8d3f1");
    expect(useSession.getState().user).toBeNull();
    expect(usePush.getState().claimed).toBe(false);
    logout.mockRestore();
    unclaimed.mockRestore();
  });

  it("signs out normally on a phone that never had a token", async () => {
    useSession.setState({ user: supplierUser });
    const logout = jest.spyOn(api, "logout").mockResolvedValue(undefined);

    await useSession.getState().logout();

    expect(logout).toHaveBeenCalledWith(null);
    logout.mockRestore();
  });

  it("puts the phone back on the unclaimed list rather than off it entirely", async () => {
    // Signing out is not uninstalling. The phone must stop receiving the
    // previous shop's job offers and stay reachable for "there is a new
    // version" — which is one unclaimed registration, not none.
    api.setToken(null);
    usePush.setState({ permission: "granted", token: "fcm-token-a7c8d3f1", claimed: true });
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);

    await usePush.getState().release();

    expect(unclaimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android");
    expect(usePush.getState().claimed).toBe(false);
    unclaimed.mockRestore();
  });
});

describe("registration deadlines", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    api.setTokenProvider(null);
  });

  it.each(["channel", "permission", "identity", "device token"])("unblocks release after a stalled %s prerequisite", async (stage) => {
    jest.useFakeTimers();
    usePush.setState({ permission: "unknown" });
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    let complete!: (value: never) => void;
    const pending = new Promise<never>((resolve) => { complete = resolve; });
    if (stage === "channel") mocked.setNotificationChannelAsync.mockReturnValueOnce(pending);
    if (stage === "permission") mocked.getPermissionsAsync.mockReturnValueOnce(pending);
    if (stage === "identity") api.setTokenProvider(() => pending);
    if (stage === "device token") mocked.getDevicePushTokenAsync.mockReturnValueOnce(pending);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
    const registration = usePush.getState().registerIfGranted();
    const release = jest.fn(async () => undefined);
    const released = serializeDeviceMutation(release);
    await jest.advanceTimersByTimeAsync(api.API_REQUEST_MS + 1);
    await Promise.all([registration, released]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
    complete({ data: "late-token", ...granted } as never);
    await jest.advanceTimersByTimeAsync(1);
    expect(register).not.toHaveBeenCalled();
  });

  it.each(["fetch", "body"])("aborts an unclaimed %s stall before the next device mutation", async (stage) => {
    jest.useFakeTimers();
    api.setToken(null);
    usePush.setState({ permission: "granted" });
    let signal: AbortSignal | null | undefined;
    const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      signal = init?.signal;
      if (stage === "fetch") return new Promise<Response>(() => {});
      return { ok: false, status: 401, text: () => new Promise<string>(() => {}) } as Response;
    });
    const registration = usePush.getState().registerIfGranted();
    const release = jest.fn(async () => { expect(signal?.aborted).toBe(true); });
    const released = serializeDeviceMutation(release);
    await jest.advanceTimersByTimeAsync(api.API_REQUEST_MS + 1);
    await Promise.all([registration, released]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(usePush.getState().busy).toBe(false);
  });
});
