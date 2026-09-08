import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetActive = jest.fn(async () => undefined);
const mockStartSSOFlow = jest.fn();

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

/**
 * The door is on a public address in the hosted pilot, so anything this screen
 * shows, it shows to anyone who opens the app. Clerk fields always start empty.
 * The replaceable local demo and the host line do not belong on this screen.
 */
describe("Sign in", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: null,
    });
  });

  it("keeps Clerk fields empty and does not offer a local demo", async () => {
    await render(<LoginScreen />);

    expect(screen.getByLabelText("Email").props.value).toBe("");
    expect(screen.getByLabelText("Password").props.value).toBe("");
    expect(screen.queryByText("Use local supplier demo")).toBeNull();
  });

  it("does not name the API host, and says what to do next", async () => {
    await render(<LoginScreen />);

    expect(screen.queryByText(/gridgo\.example/)).toBeNull();
    expect(screen.queryByText(/Answering/)).toBeNull();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText("New shop? Sign up")).toBeTruthy();
    expect(screen.queryByText(/Ask Operations to invite this email/)).toBeNull();
    expect(screen.queryByText("Turn on alerts")).toBeNull();
  });

  it("exposes a show/hide control on the password field", async () => {
    await render(<LoginScreen />);

    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Show Password")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Show Password"));

    await waitFor(() => {
      expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    });
    expect(screen.getByLabelText("Hide Password")).toBeTruthy();
    expect(screen.getByLabelText("Password").props.value).toBe("");
  });

  it("activates Google's created session before leaving sign in", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_google",
      authSessionResult: { type: "success" },
    });
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
      fireEvent.press(screen.getByLabelText("Continue with Google"));
    });

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_google" });
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
      expect(
        screen.getByLabelText("Continue with Google").props.accessibilityState.disabled,
      ).toBe(false);
    });
    expect(mockSetActive.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouter.replace.mock.invocationCallOrder[0],
    );
  });

  it("does not show Signing you in until Google has authenticated", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "success" },
    });
    await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Continue with Google"));
    });

    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalled());
    expect(screen.queryByText("Signing you in")).toBeNull();
    expect(useSession.getState().sessionWait).toBeNull();
    expect(screen.getByLabelText("Continue with Google")).toBeTruthy();
  });
});
