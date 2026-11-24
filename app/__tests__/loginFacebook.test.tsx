import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetActive = jest.fn(async () => undefined);
const mockStartSSOFlow = jest.fn();
let mockClerkUser: unknown = null;
let mockStrategies: string[] = ["oauth_google"];

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: jest.fn(async () => "clerk-jwt") }),
  useClerk: () => ({
    __internal_environment: { userSettings: { authenticatableSocialStrategies: mockStrategies } },
    setActive: mockSetActive,
    signOut: jest.fn(async () => undefined),
    get user() {
      return mockClerkUser;
    },
  }),
  useUser: () => ({ user: null }),
  useSignIn: () => ({
    signIn: {
      status: "needs_first_factor",
      password: jest.fn(),
      finalize: jest.fn(),
      mfa: { sendEmailCode: jest.fn(), verifyEmailCode: jest.fn() },
    },
    fetchStatus: "idle",
  }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: jest.fn() }),
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
import {
  FACEBOOK_CANCELLED,
  FACEBOOK_EMAIL_TAKEN,
  FACEBOOK_UNAVAILABLE,
} from "@/lib/facebookSignIn";
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

function clerkEnvironment(withFacebook: boolean) {
  mockStrategies = withFacebook ? ["oauth_google", "oauth_facebook"] : ["oauth_google"];
}

const approvedShop = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier",
  supplierName: "PrintRight",
  verificationStatus: "approved",
};

async function tapFacebook() {
  const button = await screen.findByLabelText("Continue with Facebook");
  await act(async () => {
    fireEvent.press(button);
  });
}

describe("Continue with Facebook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartSSOFlow.mockReset();
    mockClerkUser = null;
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: null,
    });
    useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT }, hydrated: true });
  });

  it("is not drawn while Clerk does not offer Facebook, and the screen stays as it was", async () => {
    clerkEnvironment(false);
    await render(<LoginScreen />);
    expect(screen.queryByLabelText("Continue with Facebook")).toBeNull();
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string | undefined);
    expect(labels.indexOf("Continue with Apple")).toBeLessThan(labels.indexOf("Continue with Google"));
  });

  it("comes first once Clerk offers it: Facebook, Google, then Apple", async () => {
    clerkEnvironment(true);
    await render(<LoginScreen />);
    await screen.findByLabelText("Continue with Facebook");
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string | undefined);
    const facebook = labels.indexOf("Continue with Facebook");
    const google = labels.indexOf("Continue with Google");
    const apple = labels.indexOf("Continue with Apple");
    expect(facebook).toBeGreaterThan(-1);
    expect(facebook).toBeLessThan(google);
    expect(google).toBeLessThan(apple);
  });

  it("asks Clerk for the Facebook strategy and opens an existing shop in its own account", async () => {
    clerkEnvironment(true);
    // Clerk linked the Facebook login to the person who already holds its email.
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: "sess_fb", authSessionResult: { type: "success" } });
    (api.me as jest.Mock).mockResolvedValue(approvedShop);
    await render(<LoginScreen />);
    await tapFacebook();

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home"));
    expect(mockStartSSOFlow).toHaveBeenCalledWith({ strategy: "oauth_facebook" });
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_fb" });
    // Never a second GRIDGO person: the ordinary door, no enrol call.
    expect(api.me).toHaveBeenCalled();
  });

  it("sends a new person to apply with their Facebook name as a default", async () => {
    clerkEnvironment(true);
    mockClerkUser = {
      firstName: "Ana",
      lastName: "Reyes",
      primaryEmailAddress: { emailAddress: "ana@example.com" },
    };
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: "sess_new", authSessionResult: { type: "success" } });
    (api.me as jest.Mock).mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));
    await render(<LoginScreen />);
    await tapFacebook();

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/signup/start"));
    expect(useSignupDraft.getState().draft.contactName).toBe("Ana Reyes");
    expect(useSignupDraft.getState().draft.email).toBe("ana@example.com");
  });

  it("does not overwrite a name the shop already typed", async () => {
    clerkEnvironment(true);
    useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT, contactName: "Ana R." }, hydrated: true });
    mockClerkUser = { firstName: "Ana", lastName: "Reyes", primaryEmailAddress: null };
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: "sess_new", authSessionResult: { type: "success" } });
    (api.me as jest.Mock).mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));
    await render(<LoginScreen />);
    await tapFacebook();

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/signup/start"));
    expect(useSignupDraft.getState().draft.contactName).toBe("Ana R.");
  });

  it("goes on to ask for an email or mobile when Facebook shared no email", async () => {
    clerkEnvironment(true);
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "success" },
      signUp: { status: "missing_requirements", missingFields: ["email_address"], unverifiedFields: [] },
    });
    await render(<LoginScreen />);
    await tapFacebook();

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: "/(auth)/facebook-details",
        params: { step: "contact" },
      }),
    );
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("says calmly that nothing changed when the person closes Facebook", async () => {
    clerkEnvironment(true);
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: null, authSessionResult: { type: "cancel" } });
    await render(<LoginScreen />);
    await tapFacebook();

    expect(await screen.findByText(FACEBOOK_CANCELLED)).toBeTruthy();
    expect(useSession.getState().sessionWait).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // The way back in is still there.
    expect(screen.getByLabelText("Continue with Facebook")).toBeEnabled();
  });

  it("says Facebook is not answering, and leaves every other way in", async () => {
    clerkEnvironment(true);
    mockStartSSOFlow.mockRejectedValue(new Error("network down"));
    await render(<LoginScreen />);
    await tapFacebook();

    expect(await screen.findByText(FACEBOOK_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByLabelText("Continue with Google")).toBeEnabled();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("points to the earlier login when Clerk will not link the Facebook email", async () => {
    clerkEnvironment(true);
    mockStartSSOFlow.mockRejectedValue({ errors: [{ code: "external_account_exists", message: "taken" }] });
    await render(<LoginScreen />);
    await tapFacebook();

    expect(await screen.findByText(FACEBOOK_EMAIL_TAKEN)).toBeTruthy();
  });
});
