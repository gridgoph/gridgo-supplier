import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import DeleteAccountScreen from "@/app/delete-account";
import { createPrivacyRequest, fileAccountDeletionRequest, revokeAppleAuthorization } from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import {
  APPLE_CANCELLED,
  APPLE_NOTICE,
  APPLE_REVOKED,
  appleRevocationFailure,
} from "@/lib/appleRevocation";
import { useAccountDeletion } from "@/store/accountDeletion";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  createPrivacyRequest: jest.fn(),
  fileAccountDeletionRequest: jest.fn(),
  revokeAppleAuthorization: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-apple-authentication", () => ({ signInAsync: jest.fn() }));

let mockProviders: string[] = ["apple"];
const mockSetActive = jest.fn();
jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      passwordEnabled: true,
      primaryEmailAddress: { emailAddress: "shop@example.com" },
      externalAccounts: mockProviders.map((provider) => ({ provider })),
    },
  }),
  useSession: () => ({
    session: {
      startVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
      prepareFirstFactorVerification: jest.fn(),
      attemptFirstFactorVerification: jest.fn(async () => ({ status: "complete" })),
    },
  }),
  useClerk: () => ({ setActive: mockSetActive }),
}));

const send = createPrivacyRequest as jest.Mock;
const file = fileAccountDeletionRequest as jest.Mock;
const revoke = revokeAppleAuthorization as jest.Mock;
const signInAsync = jest.requireMock("expo-apple-authentication").signInAsync as jest.Mock;

const REVOKED = { clientId: "ph.gridgo.supplier", status: "revoked", revokedAt: "2026-10-21T02:00:00.000Z", error: null };
const realOS = Platform.OS;

function setOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}

beforeEach(() => {
  useAccountDeletion.getState().reset();
  mockProviders = ["apple"];
  setOS("ios");
  send.mockReset().mockResolvedValue({ id: "pr_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" });
  file.mockReset().mockResolvedValue(undefined);
  revoke.mockReset().mockResolvedValue(REVOKED);
  signInAsync.mockReset().mockResolvedValue({ authorizationCode: "fresh-apple-code", identityToken: "id", user: "000123.abc" });
});

afterAll(() => setOS(realOS));

async function deleteMyAccount() {
  await render(<DeleteAccountScreen />);
  fireEvent.changeText(screen.getByLabelText("Your password"), "secret-pass");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("secret-pass"));
  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));
  await waitFor(() => expect(screen.getByText("Request sent")).toBeTruthy());
}

describe("Delete account on an Apple-linked iPhone", () => {
  it("says before sending that Apple will ask again", async () => {
    await render(<DeleteAccountScreen />);
    expect(screen.getByText(APPLE_NOTICE)).toBeTruthy();
  });

  it("shows the disconnect only once GRIDGO confirms it", async () => {
    await deleteMyAccount();
    await waitFor(() => expect(screen.getByText(APPLE_REVOKED)).toBeTruthy());
    expect(screen.getByText("Disconnected")).toBeTruthy();
    expect(signInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.supplier", "fresh-apple-code");
    // The code never goes to Clerk: the signed-in identity is not switched.
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sign in with Apple again" })).toBeNull();
  });

  it("keeps the request when Apple's sheet is closed, and offers to try again", async () => {
    signInAsync.mockRejectedValueOnce(Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }));
    await deleteMyAccount();

    await waitFor(() => expect(screen.getByText(APPLE_CANCELLED)).toBeTruthy());
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.queryByText(APPLE_REVOKED)).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Disconnect Sign in with Apple" }));
    await waitFor(() => expect(screen.getByText(APPLE_REVOKED)).toBeTruthy());
    expect(signInAsync).toHaveBeenCalledTimes(2);
  });

  it("retries a lost answer with the same code, without Apple's sheet", async () => {
    revoke.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteMyAccount();

    await waitFor(() => expect(screen.getByText(appleRevocationFailure("lost").message)).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText(APPLE_REVOKED)).toBeTruthy());
    expect(signInAsync).toHaveBeenCalledTimes(1);
    expect(revoke.mock.calls.map((call) => call[1])).toEqual(["fresh-apple-code", "fresh-apple-code"]);
  });

  it("says a wrong Apple ID plainly and asks for a fresh sign-in", async () => {
    revoke.mockRejectedValueOnce(new ApiError(403, { error: "apple_identity_mismatch" }));
    await deleteMyAccount();

    await waitFor(() => expect(screen.getByText(appleRevocationFailure("wrong_apple_id").message)).toBeTruthy());
    expect(screen.queryByText(APPLE_REVOKED)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in with Apple again" })).toBeTruthy();
  });

  it("says GRIDGO is not set up for it yet, with nothing to retry", async () => {
    revoke.mockRejectedValueOnce(new ApiError(503, { error: "apple_revocation_not_configured" }));
    await deleteMyAccount();

    await waitFor(() => expect(screen.getByText(appleRevocationFailure("not_configured").message)).toBeTruthy());
    expect(screen.queryByText(APPLE_REVOKED)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in with Apple again" })).toBeNull();
  });
});

describe("Delete account everywhere else", () => {
  it.each([
    ["Android with Apple", "android", ["apple"]],
    ["an iPhone without Apple", "ios", ["google"]],
  ] as const)("on %s says nothing about Apple", async (_, os, providers) => {
    setOS(os);
    mockProviders = [...providers];
    await render(<DeleteAccountScreen />);
    expect(screen.getByText("Delete your GRIDGO account")).toBeTruthy();
    expect(screen.queryByText(APPLE_NOTICE)).toBeNull();
  });

  it("on Android an Apple-linked account keeps today's flow", async () => {
    setOS("android");
    await deleteMyAccount();

    expect(screen.queryByText("SIGN IN WITH APPLE")).toBeNull();
    expect(file).not.toHaveBeenCalled();
    expect(signInAsync).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("on an iPhone an account without Apple keeps today's flow", async () => {
    mockProviders = ["google"];
    await deleteMyAccount();
    expect(screen.queryByText("SIGN IN WITH APPLE")).toBeNull();
    expect(file).not.toHaveBeenCalled();
    expect(signInAsync).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
});
