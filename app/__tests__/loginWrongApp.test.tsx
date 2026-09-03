import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { emailUnavailableMessage } from "@/lib/afterClerkAuth";

let mockSignInStatus = "needs_first_factor";
let mockIsSignedIn = false;

const mockPassword = jest.fn(async () => {
  mockSignInStatus = "needs_client_trust";
  return { error: null };
});
const mockSendEmailCode = jest.fn(async () => ({ error: null }));
const mockGetToken = jest.fn(async (): Promise<string | null> => "clerk-jwt");
const mockSignOut = jest.fn(async () => undefined);
const mockSetActive = jest.fn(async () => undefined);
const mockStartSSOFlow = jest.fn();
const mockFinalize = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockIsSignedIn, getToken: mockGetToken }),
  useClerk: () => ({ setActive: mockSetActive, signOut: mockSignOut }),
  useUser: () => ({ user: null }),
  useSignIn: () => ({
    signIn: {
      get status() {
        return mockSignInStatus;
      },
      password: mockPassword,
      finalize: mockFinalize,
      mfa: {
        sendEmailCode: mockSendEmailCode,
        verifyEmailCode: jest.fn(),
      },
    },
    fetchStatus: "idle",
  }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
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

const clientUser = {
  id: "c1",
  email: "mark@example.com",
  name: "Mark",
  role: "client" as const,
};

async function submitClientPassword() {
  await render(<LoginScreen />);
  await fireEvent.changeText(screen.getByLabelText("Email"), "mark@example.com");
  await fireEvent.changeText(screen.getByLabelText("Password"), "client-password");
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

describe("Sign in of a GRIDGO client identity", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_first_factor";
    mockIsSignedIn = false;
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    mockPassword.mockReset().mockImplementation(async () => {
      mockSignInStatus = "needs_client_trust";
      return { error: null };
    });
    mockSendEmailCode.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockStartSSOFlow.mockReset();
    mockSetActive.mockReset().mockResolvedValue(undefined);
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: null,
    });
    (api.me as jest.Mock).mockResolvedValue(clientUser);
  });

  it("does not mail a code or leave Sign in when Clerk asks for email next", async () => {
    await submitClientPassword();

    await waitFor(() => {
      expect(screen.getByText(emailUnavailableMessage)).toBeTruthy();
    });
    expect(mockSendEmailCode).not.toHaveBeenCalled();
    expect(screen.queryByText("Check your email")).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("mails a new-device code when Clerk has not issued a JWT yet", async () => {
    mockGetToken.mockResolvedValue(null);
    mockFinalize.mockResolvedValue({ error: { message: "needs client trust" } });

    await submitClientPassword();

    await waitFor(() => {
      expect(mockSendEmailCode).toHaveBeenCalled();
      expect(screen.getByText("Check your email")).toBeTruthy();
    });
    expect(screen.queryByText(emailUnavailableMessage)).toBeNull();
  });

  it("does not keep Signing you in when Google returns a client account", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_google",
      authSessionResult: { type: "success" },
    });

    await render(<LoginScreen />);
    fireEvent.press(screen.getByLabelText("Continue with Google"));

    await waitFor(() => {
      expect(screen.getByText(emailUnavailableMessage)).toBeTruthy();
    });
    expect(screen.queryByText("Signing you in")).toBeNull();
    expect(screen.getByLabelText("Continue with Google")).toBeTruthy();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/access");
    expect(useSession.getState().sessionWait).toBeNull();
  });

  it("stays on Sign in after a complete password, never the closed-shop screen", async () => {
    mockPassword.mockImplementation(async () => {
      mockSignInStatus = "complete";
      return { error: null };
    });

    await submitClientPassword();

    await waitFor(() => {
      expect(screen.getByText(emailUnavailableMessage)).toBeTruthy();
    });
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/access");
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/(tabs)/home");
    expect(mockSignOut).toHaveBeenCalled();
  });
});
