import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { requestAccountDeletion } from "@/lib/api";
import DeleteAccountScreen from "@/app/delete-account";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({ requestAccountDeletion: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockStart = jest.fn(async () => ({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }] }));
const mockAttempt = jest.fn(async () => ({ status: "complete" }));
const mockPrepare = jest.fn();

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: true,
    user: { passwordEnabled: true, primaryEmailAddress: { emailAddress: "client@example.com" } },
  }),
  useSession: () => ({
    session: {
      startVerification: mockStart,
      prepareFirstFactorVerification: mockPrepare,
      attemptFirstFactorVerification: mockAttempt,
    },
  }),
}));

const send = requestAccountDeletion as jest.Mock;

/**
 * The whole point of the screen: the request goes out only after Clerk has
 * re-checked the password typed here. One test per file (see AGENTS.md).
 */
it("checks the typed password with the sign-in, then sends one deletion request", async () => {
  send.mockResolvedValue({ ok: true, message: "We will delete your account within 30 days" });
  await render(<DeleteAccountScreen />);

  expect(screen.getByText("CONFIRM IT IS YOU")).toBeTruthy();
  expect(send).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("Your password"), "secret-pass");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("secret-pass"));

  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));

  await waitFor(() => expect(screen.getByText("Request sent")).toBeTruthy());
  expect(mockStart).toHaveBeenCalledWith({ level: "first_factor" });
  expect(mockAttempt).toHaveBeenCalledWith({ strategy: "password", password: "secret-pass" });
  expect(send).toHaveBeenCalledTimes(1);
  expect(mockAttempt.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
  expect(screen.getByText("We will delete your account within 30 days")).toBeTruthy();
});
