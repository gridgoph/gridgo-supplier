import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetActive = jest.fn(async () => undefined);
const mockStartSSOFlow = jest.fn();
const mockStartApple = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: jest.fn(async () => "clerk-jwt") }),
  useClerk: () => ({ setActive: mockSetActive, signOut: jest.fn(async () => undefined) }),
  useUser: () => ({ user: null }),
  useSignIn: () => ({
    signIn: {
      status: "needs_first_factor",
      password: jest.fn(),
      finalize: jest.fn(),
      mfa: {
        sendEmailCode: jest.fn(),
        verifyEmailCode: jest.fn(),
      },
    },
    fetchStatus: "idle",
  }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: mockStartApple }),
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
import { APPLE_SIGN_UP_INCOMPLETE } from "@/lib/appleSignIn";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

/**
 * Sign in with Apple on the sign-in screen (iPhone; the Jest preset runs as
 * iOS). Apple, like Google, only proves who the person is: the session lands
 * through the same GRIDGO door, so a shop reaches Home and nobody else does.
 */
describe("Sign in with Apple", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartApple.mockReset();
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: null,
    });
  });

  it("puts Apple's button above Google's", async () => {
    await render(<LoginScreen />);
    const labels = screen
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel as string | undefined);
    expect(labels.indexOf("Continue with Apple")).toBeGreaterThan(-1);
    expect(labels.indexOf("Continue with Apple")).toBeLessThan(
      labels.indexOf("Continue with Google"),
    );
  });

  it("activates Apple's session before the shop leaves sign in", async () => {
    mockStartApple.mockResolvedValue({ createdSessionId: "sess_apple" });
    (api.me as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "shop@example.com",
      name: "Ben",
      role: "supplier",
      supplierName: "PrintRight",
      verificationStatus: "approved",
    });
    await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Continue with Apple"));
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_apple" });
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(mockSetActive.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouter.replace.mock.invocationCallOrder[0],
    );
    expect(mockStartSSOFlow).not.toHaveBeenCalled();
  });

  it("says nothing when the person closes Apple's sheet", async () => {
    mockStartApple.mockResolvedValue({ createdSessionId: null });
    await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Continue with Apple"));
    });

    await waitFor(() => expect(mockStartApple).toHaveBeenCalled());
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useSession.getState().sessionWait).toBeNull();
    expect(screen.queryByText("Apple could not sign you in just now. Try again.")).toBeNull();
  });

  it("treats Apple's own cancel code as a closed sheet, not an error", async () => {
    mockStartApple.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Continue with Apple"));
    });

    await waitFor(() => expect(mockStartApple).toHaveBeenCalled());
    expect(screen.queryByText("Apple could not sign you in just now. Try again.")).toBeNull();
  });

  it("says what is missing when Clerk cannot finish the Apple sign-up", async () => {
    mockStartApple.mockResolvedValue({
      createdSessionId: null,
      signUp: { status: "missing_requirements", missingFields: ["phone_number"] },
    });
    await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Continue with Apple"));
    });

    expect(await screen.findByText(APPLE_SIGN_UP_INCOMPLETE)).toBeTruthy();
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});
