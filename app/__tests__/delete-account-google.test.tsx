import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { requestAccountDeletion } from "@/lib/api";
import DeleteAccountScreen from "@/app/delete-account";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({ requestAccountDeletion: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockStart = jest.fn(async () => ({
  status: "needs_first_factor",
  supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "idn_1", safeIdentifier: "c***@example.com" }],
}));
const mockPrepare = jest.fn(async () => ({ status: "needs_first_factor" }));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: true,
    // Signed up with Google: Clerk holds no password for this account.
    user: { passwordEnabled: false, primaryEmailAddress: { emailAddress: "client@example.com" } },
  }),
  useSession: () => ({
    session: {
      startVerification: mockStart,
      prepareFirstFactorVerification: mockPrepare,
      attemptFirstFactorVerification: jest.fn(),
    },
  }),
}));

const send = requestAccountDeletion as jest.Mock;

it("asks a Google-only account for an emailed code instead of a password it never set", async () => {
  await render(<DeleteAccountScreen />);

  expect(screen.queryByLabelText("Your password")).toBeNull();
  expect(screen.getByText(/This account signs in with Google/)).toBeTruthy();
  // Nothing to delete with yet: the only action is to get the code.
  expect(screen.queryByRole("button", { name: "Delete my account" })).toBeNull();

  fireEvent.press(screen.getByRole("button", { name: "Email me a code" }));

  await waitFor(() => expect(screen.getByLabelText("Code from the email")).toBeTruthy());
  expect(mockPrepare).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "idn_1" });
  expect(screen.getByText("Sent to c***@example.com.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete my account" })).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
});
