import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockSignInStatus = "needs_first_factor";
const mockPassword = jest.fn();
const mockFinalize = jest.fn(async () => ({ error: null }));
const mockGetToken = jest.fn(async () => "clerk-jwt");
const mockSignOut = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: mockGetToken }),
  useClerk: () => ({ setActive: jest.fn(), signOut: mockSignOut }),
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "shop@example.com" } },
  }),
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
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

describe("Sign in of an unmapped Clerk identity", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_first_factor";
    mockRouter.replace.mockClear();
    mockPassword.mockReset();
    mockFinalize.mockClear();
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
    (api.me as jest.Mock).mockReset().mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));
    useSignupDraft.setState({
      draft: {
        ...EMPTY_SIGNUP_DRAFT,
        shopName: "Mark Prints",
        contactName: "Mark David",
        email: "shop@example.com",
        phone: "09975643866",
      },
      hydrated: true,
    });
  });

  it("opens apply at the first unfinished step, not Home and not a fresh password", async () => {
    mockPassword.mockImplementation(async () => {
      mockSignInStatus = "complete";
      return { error: null };
    });

    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "shop@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "shop-password");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/signup/location");
    });
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/(tabs)/home");
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/(auth)/signup");
  });
});
