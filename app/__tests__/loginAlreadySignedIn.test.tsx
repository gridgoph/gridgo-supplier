import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { emailUnavailableMessage } from "@/lib/afterClerkAuth";

let mockSignInStatus = "needs_first_factor";
let mockIsSignedIn = false;
let mockLeftoverUser: {
  primaryEmailAddress?: { emailAddress: string };
  publicMetadata?: Record<string, unknown>;
} | null = null;
const alreadySignedIn = { errors: [{ message: "You're already signed in." }] };

const mockPassword = jest.fn();
const mockFinalize = jest.fn(async () => ({ error: null }));
const mockGetToken = jest.fn(async () => "clerk-jwt");
const mockSignOut = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockIsSignedIn, getToken: mockGetToken }),
  useClerk: () => ({ setActive: jest.fn(), signOut: mockSignOut }),
  useUser: () => ({ user: mockLeftoverUser }),
  useSignIn: () => ({
    signIn: {
      get status() {
        return mockSignInStatus;
      },
      password: mockPassword,
      finalize: mockFinalize,
      mfa: {
        sendEmailCode: jest.fn(),
        verifyEmailCode: jest.fn(),
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

const leftoverClient = {
  id: "c1",
  email: "client@example.com",
  name: "Mark",
  role: "client" as const,
};

async function submitTyped(email: string, password: string) {
  await render(<LoginScreen />);
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

describe("Sign in leftover Clerk session", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_first_factor";
    mockIsSignedIn = false;
    mockLeftoverUser = null;
    mockRouter.replace.mockClear();
    mockPassword.mockReset();
    mockFinalize.mockClear();
    mockSignOut.mockClear();
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
    (api.me as jest.Mock).mockReset().mockResolvedValue(pendingShop);
  });

  it.each([false, true])("recovers a leftover session and signs in (previous session ended: %s)", async (sessionEnded) => {
    if (sessionEnded) {
      useSession.setState({ identity: { kind: "signed_out", reason: "session_ended" } });
    }
    mockPassword
      .mockResolvedValueOnce({ error: alreadySignedIn })
      .mockImplementationOnce(async () => {
        mockSignInStatus = "complete";
        return { error: null };
      });

    await submitTyped("shop@example.com", "shop-password");

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPassword).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("You're already signed in.")).toBeNull();
    expect(screen.queryByText(/currently logged in/i)).toBeNull();
  });

  it("clears a leftover client session so a different shop email can sign in", async () => {
    mockIsSignedIn = true;
    mockLeftoverUser = {
      primaryEmailAddress: { emailAddress: leftoverClient.email },
      publicMetadata: {},
    };
    (api.me as jest.Mock)
      .mockResolvedValueOnce(leftoverClient)
      .mockResolvedValue(pendingShop);
    mockPassword.mockImplementation(async () => {
      mockSignInStatus = "complete";
      return { error: null };
    });

    await submitTyped("shop@example.com", "shop-password");

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPassword).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(emailUnavailableMessage)).toBeNull();
  });

  it("refuses when the leftover non-shop is the same email that was typed", async () => {
    mockIsSignedIn = true;
    mockLeftoverUser = {
      primaryEmailAddress: { emailAddress: leftoverClient.email },
      publicMetadata: {},
    };
    (api.me as jest.Mock).mockResolvedValue(leftoverClient);
    mockPassword.mockImplementation(async () => {
      mockSignInStatus = "complete";
      return { error: null };
    });

    await submitTyped(leftoverClient.email, "client-password");

    await waitFor(() => {
      expect(screen.getByText(emailUnavailableMessage)).toBeTruthy();
    });
    expect(mockPassword).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/(tabs)/home");
    expect(mockSignOut).toHaveBeenCalled();
  });
});
