import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetActive = jest.fn(async () => undefined);
const mockStartSSOFlow = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: jest.fn(async () => "clerk-jwt") }),
  useClerk: () => ({ setActive: mockSetActive }),
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
import { DEV_LOGIN } from "@/lib/devLogin";

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

/**
 * The door is on a public address in the hosted pilot, so anything this screen
 * shows, it shows to anyone who opens the app. Clerk fields always start empty;
 * the replaceable local demo is a separate development-only action. The
 * production strip is proved separately by `devLoginDisclosure.test.ts` and
 * the export assert.
 */
describe("Sign in", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps Clerk fields empty and the pilot supplier in a separate dev action", async () => {
    await render(<LoginScreen />);

    expect(DEV_LOGIN).not.toBeNull();
    expect(screen.getByLabelText("Email").props.value).toBe("");
    expect(screen.getByLabelText("Password").props.value).toBe("");
    expect(screen.getByText("Use local supplier demo")).toBeTruthy();
  });

  it("still says which host it is talking to, and what to do next", async () => {
    await render(<LoginScreen />);

    // Jest is a development runtime, so the guarded connection line is live.
    expect(screen.getByText(/gridgo\.example/)).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText("New shop? Sign up")).toBeTruthy();
    expect(screen.queryByText(/Ask Operations to invite this email/)).toBeNull();
    expect(screen.queryByText("Turn on alerts")).toBeNull();
  });

  it("puts the host behind the same compile-time guard as the credentials", () => {
    // A release build names no infrastructure: `GRIDGO on <host>` and its
    // red "No answer" chip mean nothing to a shop owner and this screen is on
    // a public address. `__DEV__` is substituted by Metro, so the guard must
    // wrap the **whole component at module scope** — a branch inside the screen
    // renders nothing in production but still ships every one of its literals,
    // which is exactly what the export assert caught. The same argument
    // `lib/devLogin.ts` makes.
    const source = readFileSync(resolve(__dirname, "../(auth)/login.tsx"), "utf8");

    const declaration = source.match(/^const DevConnectionLine.*$/m)?.[0] ?? "";
    expect(declaration).toContain("= __DEV__");
    expect(source).toContain("{DevConnectionLine ? (");
    // And what a release build shows instead: one plain sentence, only when
    // there is genuinely a problem.
    expect(source).toMatch(/healthState === "unreachable"/);
    expect(source).toContain("Can’t reach GRIDGO right now");
  });

  it("exposes a show/hide control on the password field", async () => {
    await render(<LoginScreen />);

    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Show password")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Show password"));

    await waitFor(() => {
      expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    });
    expect(screen.getByLabelText("Hide password")).toBeTruthy();
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
});
