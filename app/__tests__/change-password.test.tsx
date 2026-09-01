import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ChangePasswordScreen from "@/app/change-password";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
}));

const mockUpdatePassword = jest.fn(async () => undefined);

const mockClerkUser = {
  passwordEnabled: true,
  updatePassword: mockUpdatePassword,
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser, isLoaded: true }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderScreen() {
  return render(<ChangePasswordScreen />);
}

/** Fill a box and let the value land before the next is typed. */
async function type(label: string, value: string) {
  fireEvent.changeText(screen.getByLabelText(label), value);
  await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(value));
}

/**
 * Setting a new password on the sign-in.
 *
 * Clerk's own user resource does this — `user.updatePassword` — so the shop
 * stays signed in. The assertion that matters most is `signOutOfOtherSessions`.
 * The screen promises that in words above the button, so the call has to
 * actually do it.
 *
 * One interacting submit per file: the submit drives async state, and this
 * stack empties every later render in the same file once that has happened.
 */
describe("changing the sign-in password", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockUpdatePassword.mockClear();
  });

  it("sends both passwords to Clerk and signs every other session out", async () => {
    const view = await renderScreen();

    expect(screen.getByText(/signs you out everywhere else you are signed in/i)).toBeTruthy();
    expect(screen.getByLabelText("Show Current password")).toBeTruthy();
    expect(screen.getByLabelText("Show New password")).toBeTruthy();
    expect(screen.getByLabelText("Show Confirm new password")).toBeTruthy();

    await type("Current password", "oldpassword");
    await type("New password", "newpassword");
    await type("Confirm new password", "newpassword");

    fireEvent.press(screen.getByText("Change password"));

    await waitFor(() =>
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: "oldpassword",
        newPassword: "newpassword",
        signOutOfOtherSessions: true,
      }),
    );

    await waitFor(() => expect(screen.getByText("Password changed")).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
    await view.unmount();
  });
});
