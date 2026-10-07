import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { DELETION_PASSWORD_WRONG } from "@/lib/accountDeletion";
import { requestAccountDeletion } from "@/lib/api";
import DeleteAccountScreen from "@/app/delete-account";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({ requestAccountDeletion: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockAttempt = jest.fn(async () => {
  throw { errors: [{ code: "form_password_incorrect" }] };
});

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: true,
    user: { passwordEnabled: true, primaryEmailAddress: { emailAddress: "client@example.com" } },
  }),
  useSession: () => ({
    session: {
      startVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
      prepareFirstFactorVerification: jest.fn(),
      attemptFirstFactorVerification: mockAttempt,
    },
  }),
}));

const send = requestAccountDeletion as jest.Mock;

it("keeps the request back and points at the field when the password is wrong", async () => {
  await render(<DeleteAccountScreen />);

  fireEvent.changeText(screen.getByLabelText("Your password"), "not-it");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("not-it"));

  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));

  await waitFor(() => expect(screen.getByText(DELETION_PASSWORD_WRONG)).toBeTruthy());
  expect(mockAttempt).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
  expect(screen.queryByText("Request sent")).toBeNull();
});
