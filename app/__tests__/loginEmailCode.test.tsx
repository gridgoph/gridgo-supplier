import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockSignInStatus = "needs_first_factor";

const mockPassword = jest.fn(async () => {
  mockSignInStatus = "needs_client_trust";
  return { error: null };
});
const mockSendEmailCode = jest.fn(async () => ({ error: null }));
const mockVerifyEmailCode = jest.fn(async () => {
  mockSignInStatus = "complete";
  return { error: null };
});
const mockFinalize = jest.fn(async () => ({ error: null }));
const mockGetToken = jest.fn(async () => "clerk-jwt");

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: mockGetToken }),
  useClerk: () => ({ setActive: jest.fn() }),
  useSignIn: () => ({
    signIn: {
      get status() {
        return mockSignInStatus;
      },
      password: mockPassword,
      finalize: mockFinalize,
      mfa: {
        sendEmailCode: mockSendEmailCode,
        verifyEmailCode: mockVerifyEmailCode,
      },
    },
    fetchStatus: "idle",
  }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api") as typeof import("@/lib/api");
  return {
    ...actual,
    getApiBase: () => "https://gridgo.example",
    health: jest.fn().mockResolvedValue({ ok: true }),
    me: jest.fn(),
  };
});

import LoginScreen from "@/app/(auth)/login";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

const pendingShop = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier" as const,
  supplierName: "PrintRight",
  verificationStatus: "pending" as const,
};

describe("Sign in email code", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_first_factor";
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    mockPassword.mockClear();
    mockSendEmailCode.mockClear();
    mockVerifyEmailCode.mockClear();
    mockFinalize.mockClear();
    mockGetToken.mockClear();
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
    (api.me as jest.Mock).mockResolvedValue(pendingShop);
  });

  it("sends an email code after password, then adopts the shop onto Home", async () => {
    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "shop@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "secret-pass");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockSendEmailCode).toHaveBeenCalled();
      expect(screen.getByText("Check your email")).toBeTruthy();
      expect(screen.getByText("Send another code")).toBeTruthy();
    });
    expect(mockFinalize).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("6-digit job number"), "148203");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() => {
      expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: "148203" });
      expect(mockFinalize).toHaveBeenCalled();
      expect(api.me).toHaveBeenCalled();
      expect(useSession.getState().user).toMatchObject({
        id: "u1",
        verificationStatus: "pending",
      });
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
    });
  });
});
