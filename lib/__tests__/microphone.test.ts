import { PermissionsAndroid, Platform } from "react-native";

import { readMicPermission, requestMicPermission } from "@/lib/microphone";

describe("the microphone on Android", () => {
  const original = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, "OS", { get: () => original, configurable: true });
  });
  afterEach(() => jest.restoreAllMocks());

  it("reads granted and not-yet-asked", async () => {
    jest.spyOn(PermissionsAndroid, "check").mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(readMicPermission()).resolves.toBe("granted");
    await expect(readMicPermission()).resolves.toBe("prompt");
  });

  it("tells a refusal Android will ask again from one only settings can undo", async () => {
    const request = jest.spyOn(PermissionsAndroid, "request");
    request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
    await expect(requestMicPermission()).resolves.toBe("granted");
    request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
    await expect(requestMicPermission()).resolves.toBe("prompt");
    request.mockResolvedValueOnce(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    await expect(requestMicPermission()).resolves.toBe("blocked");
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  });

  it("treats a failing permission module as not yet asked", async () => {
    jest.spyOn(PermissionsAndroid, "check").mockRejectedValueOnce(new Error("no activity"));
    await expect(readMicPermission()).resolves.toBe("prompt");
  });
});
