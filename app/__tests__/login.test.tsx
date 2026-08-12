import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Redirect: () => null,
}));

jest.mock("@/lib/api", () => ({
  getApiBase: () => "https://gridgo.example",
  health: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("@/store/session", () => ({
  isSignedIn: () => false,
  useSession: () => ({
    user: null,
    login: jest.fn(),
    loading: false,
    error: null,
  }),
}));

import LoginScreen from "@/app/(auth)/login";
import { DEV_LOGIN } from "@/lib/devLogin";

/**
 * The door is on a public address in the hosted pilot, so anything this screen
 * shows, it shows to anyone who opens the app. A release build must arrive with
 * empty fields. Jest runs with `__DEV__ === true`, so the development prefill
 * is visible here — that is the captain's one-tap path. The production strip
 * is proved separately by `devLoginDisclosure.test.ts` and the export assert.
 */
describe("Sign in", () => {
  it("prefills the pilot supplier only while __DEV__ is true", async () => {
    await render(<LoginScreen />);

    // Jest is a development runtime, so the guarded branch is live.
    expect(DEV_LOGIN).not.toBeNull();
    expect(screen.getByLabelText("Email").props.value).toBe(DEV_LOGIN!.email);
    expect(screen.getByLabelText("Password").props.value).toBe(DEV_LOGIN!.password);
    expect(DEV_LOGIN!.email).toBe("supplier@gridgo.ph");
  });

  it("still says which host it is talking to, and what to do next", async () => {
    await render(<LoginScreen />);

    // Jest is a development runtime, so the guarded connection line is live.
    expect(screen.getByText(/gridgo\.example/)).toBeTruthy();
    expect(screen.getByText("Open a shop account")).toBeTruthy();
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
    expect(screen.getByLabelText("Password").props.value).toBe(DEV_LOGIN!.password);
  });
});
