import { render, screen } from "@testing-library/react-native";

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

/**
 * The door is on a public address in the hosted pilot, so anything this screen
 * shows, it shows to anyone who opens the app. It used to arrive with the pilot
 * account's email and password already typed in — a convenience on a laptop and
 * a way in on a hosted build.
 */
describe("Sign in", () => {
  it("hands nobody a credential", async () => {
    await render(<LoginScreen />);

    expect(screen.getByLabelText("Email").props.value).toBe("");
    expect(screen.getByLabelText("Password").props.value).toBe("");
  });

  it("still says which host it is talking to, and what to do next", async () => {
    await render(<LoginScreen />);

    expect(screen.getByText(/gridgo\.example/)).toBeTruthy();
    expect(screen.getByText("Open a shop account")).toBeTruthy();
  });
});
