jest.mock("expo-file-system", () => ({
  // The device filesystem is native. Keep its byte-reading contract while
  // running Expo's real multipart serializer below.
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    name = "portrait.jpg";
    type = "image/jpeg";
    bytes = async () => new Uint8Array([255, 216, 255, 217]);
  },
}));

import { File as DeviceFile } from "expo-file-system";
import { Platform } from "react-native";
import { TextEncoder } from "util";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

import * as ImagePicker from "expo-image-picker";

import {
  changeShopPortrait,
  changeSignInPassword,
  confirmEmailChange,
  emailKeptByGridgo,
  EMAIL_ALREADY_REGISTERED,
  EMAIL_UNCHANGED,
  newEmailProblem,
  passwordProblems,
  passwordReady,
  portraitFile,
  PORTRAIT_FAILED,
  PORTRAIT_CAMERA_REFUSED,
  startEmailChange,
  type ClerkEmailAddress,
} from "@/lib/clerkIdentity";

/** A Clerk refusal, in the shape Clerk actually throws. */
function clerkError(code: string, message = "That email address is taken.") {
  return { errors: [{ code, message, longMessage: message }] };
}

const { convertFormDataAsync } = jest.requireActual<{
  convertFormDataAsync: (form: FormData) => Promise<{ body: Uint8Array }>;
}>("expo/src/winter/fetch/convertFormData");
const { installFormDataPatch } = jest.requireActual<{
  installFormDataPatch: (form: typeof FormData) => typeof FormData;
}>("expo/src/winter/FormData");
const NativeFormData = installFormDataPatch(
  jest.requireActual("react-native/Libraries/Network/FormData").default,
);
globalThis.TextEncoder ??= TextEncoder;

describe("the shop's portrait", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("reproduces the old URI descriptor failure in Expo 57's multipart serializer", async () => {
    const form = new NativeFormData();
    form.append("file", { uri: "file:///cache/portrait.jpg", name: "portrait.jpg", type: "image/jpeg" } as unknown as Blob);
    await expect(convertFormDataAsync(form)).rejects.toThrow("Unsupported FormDataPart implementation");
  });

  it("serializes image bytes from a device File instead of sending the URI", async () => {
    const file = portraitFile({ uri: "file:///cache/portrait.jpg" });
    expect(file).toBeInstanceOf(DeviceFile);
    const form = new NativeFormData();
    form.append("file", file);
    const { body } = await convertFormDataAsync(form);
    expect(Buffer.from(body).includes(Buffer.from([255, 216, 255, 217]))).toBe(true);
    expect(Buffer.from(body).toString()).toContain('filename="portrait.jpg"');
    expect(Buffer.from(body).toString()).toContain("image/jpeg");
    expect(Buffer.from(body).toString()).not.toContain("file://");
  });

  it.each([
    ["android", "library"], ["android", "camera"],
    ["ios", "library"], ["ios", "camera"],
  ] as const)("saves and reloads a photo on %s from the %s", async (platform, source) => {
    jest.replaceProperty(Platform, "OS", platform);
    const picker = source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (picker as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/portrait.jpg" }],
    });
    const user = {
      setProfileImage: jest.fn(async ({ file }: { file: Blob | File | string | null }) => {
        const form = new NativeFormData();
        form.append("file", file as Blob);
        await convertFormDataAsync(form);
      }),
      reload: jest.fn(async () => undefined),
    };

    expect(await changeShopPortrait(user, source)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({ file: expect.any(DeviceFile) });
    expect(user.reload).toHaveBeenCalledTimes(1);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images"], allowsEditing: true }));
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(source === "camera" ? 1 : 0);
  });

  it.each(["library", "camera"] as const)("says nothing when the shop cancels the %s", async (source) => {
    const picker = source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (picker as jest.Mock).mockResolvedValue({ canceled: true });
    const user = { setProfileImage: jest.fn() };
    expect(await changeShopPortrait(user, source)).toEqual({ status: "cancelled" });
    expect(user.setProfileImage).not.toHaveBeenCalled();
  });

  it("explains camera permission refusal without opening the camera or uploading", async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const user = { setProfileImage: jest.fn() };
    expect(await changeShopPortrait(user, "camera")).toEqual({ status: "failed", message: PORTRAIT_CAMERA_REFUSED });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(user.setProfileImage).not.toHaveBeenCalled();
  });

  it.each([
    new Error("ClerkJS: Network error at /v1/me/profile_image: Unsupported FormDataPart implementation"),
    clerkError("file_too_large", "Raw service response"),
  ])("keeps upload failures plain and permits another attempt", async (error) => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false, assets: [{ uri: "file:///cache/portrait.jpg" }],
    });
    const user = { setProfileImage: jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined), reload: jest.fn() };
    expect(await changeShopPortrait(user)).toEqual({ status: "failed", message: PORTRAIT_FAILED });
    expect(user.reload).not.toHaveBeenCalled();
    expect(await changeShopPortrait(user)).toEqual({ status: "ok" });
    expect(user.reload).toHaveBeenCalledTimes(1);
  });
});

describe("what is wrong with a new address before a round trip", () => {
  it("asks for one at all", () => {
    expect(newEmailProblem("  ", "shop@example.com")).toContain("Enter the email");
  });

  it("catches something that is not an address", () => {
    expect(newEmailProblem("shop.example.com", "shop@example.com")).toContain(
      "does not look like an email",
    );
  });

  /** No Clerk call for the address the shop already has. */
  it("says so when it is already the address, whatever the case", () => {
    expect(newEmailProblem("SHOP@example.com", "shop@example.com")).toBe(EMAIL_UNCHANGED);
  });

  it("passes a genuinely new address", () => {
    expect(newEmailProblem("new@example.com", "shop@example.com")).toBeNull();
  });
});

describe("moving the sign-in email", () => {
  function pending(overrides: Partial<ClerkEmailAddress> = {}): ClerkEmailAddress {
    return {
      id: "idn_1",
      emailAddress: "new@example.com",
      prepareVerification: jest.fn(async () => undefined),
      attemptVerification: jest.fn(async () => undefined),
      ...overrides,
    };
  }

  it("claims the address and sends it a code", async () => {
    const created = pending();
    const user = {
      createEmailAddress: jest.fn(async () => created),
      update: jest.fn(async () => undefined),
    };

    const outcome = await startEmailChange(user, "  new@example.com ");

    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "new@example.com" });
    expect(created.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(outcome).toEqual({ status: "ok", value: created });
  });

  /**
   * The captain's rule: do not retry and do not steal. An address Clerk already
   * holds belongs to a sign-in somebody uses, and there is no version of trying
   * harder that makes it this shop's.
   */
  it("reports an address that already has a sign-in as its own outcome", async () => {
    const user = {
      createEmailAddress: jest.fn(async () => {
        throw clerkError("form_identifier_exists");
      }),
      update: jest.fn(async () => undefined),
    };

    expect(await startEmailChange(user, "taken@example.com")).toEqual({
      status: "already_registered",
    });
    // Nothing is retried and nothing is made primary.
    expect(user.createEmailAddress).toHaveBeenCalledTimes(1);
    expect(user.update).not.toHaveBeenCalled();
  });

  it("confirms the code and makes the address the one that signs in", async () => {
    const address = pending();
    const user = {
      createEmailAddress: jest.fn(async () => address),
      update: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    const outcome = await confirmEmailChange(user, address, " 123456 ");

    expect(address.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: "idn_1" });
    expect(outcome).toEqual({ status: "ok", value: "new@example.com" });
  });

  /** A wrong code must not go on to move the sign-in. */
  it("stops at a refused code", async () => {
    const address = pending({
      attemptVerification: jest.fn(async () => {
        throw clerkError("form_code_incorrect", "That code is incorrect.");
      }),
    });
    const user = {
      createEmailAddress: jest.fn(async () => address),
      update: jest.fn(async () => undefined),
    };

    expect(await confirmEmailChange(user, address, "000000")).toEqual({
      status: "failed",
      message: "That code is incorrect.",
    });
    expect(user.update).not.toHaveBeenCalled();
  });
});

/**
 * Clerk and GRIDGO hold the address separately, and GRIDGO will not take one
 * another shop's record already holds. Saying "saved" there would leave a shop
 * signing in with one address and listed under another.
 */
describe("when GRIDGO keeps its own address", () => {
  it("names both addresses and sends the shop to Operations", () => {
    const sentence = emailKeptByGridgo("new@example.com", "old@example.com");
    expect(sentence).toContain("new@example.com");
    expect(sentence).toContain("old@example.com");
    expect(sentence).toContain("Operations");
  });

  it("keeps the already-registered refusal free of codes and retries", () => {
    expect(EMAIL_ALREADY_REGISTERED).toContain("already has a GRIDGO sign-in");
    expect(EMAIL_ALREADY_REGISTERED).not.toMatch(/form_|Clerk|error/i);
  });
});

describe("passwordProblems", () => {
  it("passes a real change", () => {
    const draft = { current: "oldpassword", next: "newpassword", confirm: "newpassword" };
    expect(passwordProblems(draft)).toEqual({});
    expect(passwordReady(draft)).toBe(true);
  });

  it("asks for the current password before anything else", () => {
    expect(
      passwordProblems({ current: "", next: "newpassword", confirm: "newpassword" }).current,
    ).toMatch(/sign in with now/i);
  });

  it("holds the new one to apply's own bar, in apply's own words", () => {
    expect(
      passwordProblems({ current: "oldpassword", next: "short", confirm: "short" }).next,
    ).toMatch(/at least 8 characters/i);
  });

  it("refuses the password the shop already has", () => {
    expect(
      passwordProblems({ current: "samepassword", next: "samepassword", confirm: "samepassword" })
        .next,
    ).toMatch(/already have/i);
  });

  it("catches a typo in the confirmation, on the confirmation", () => {
    const problems = passwordProblems({
      current: "oldpassword",
      next: "newpassword",
      confirm: "newpasswrod",
    });
    expect(problems.confirm).toMatch(/do not match/i);
    expect(problems.next).toBeUndefined();
  });
});

describe("changeSignInPassword", () => {
  const draft = { current: "oldpassword", next: "newpassword", confirm: "newpassword" };

  it("signs every other session out, and does not offer not to", async () => {
    const user = { updatePassword: jest.fn(async () => undefined) };
    expect(await changeSignInPassword(user, draft)).toEqual({ status: "ok" });
    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: "oldpassword",
      newPassword: "newpassword",
      signOutOfOtherSessions: true,
    });
  });

  it("points a wrong current password at the current-password field", async () => {
    const user = {
      updatePassword: jest.fn(async () => {
        throw clerkError("form_password_incorrect");
      }),
    };
    expect(await changeSignInPassword(user, draft)).toEqual({ status: "wrong_current" });
  });

  it("puts a pwned or weak new password on the new-password field", async () => {
    const user = {
      updatePassword: jest.fn(async () => {
        throw clerkError("form_password_pwned", "This password has been found in a breach.");
      }),
    };
    expect(await changeSignInPassword(user, draft)).toEqual({
      status: "new_rejected",
      message: "This password has been found in a breach.",
    });
  });

  it("keeps Clerk's own sentence for anything else", async () => {
    const user = {
      updatePassword: jest.fn(async () => {
        throw clerkError("too_many_requests", "Too many attempts. Try again later.");
      }),
    };
    expect(await changeSignInPassword(user, draft)).toEqual({
      status: "failed",
      message: "Too many attempts. Try again later.",
    });
  });
});
