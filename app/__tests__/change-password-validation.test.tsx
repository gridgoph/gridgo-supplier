import { fireEvent, render, screen } from "@testing-library/react-native";

import ChangePasswordScreen from "@/app/change-password";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockUpdatePassword = jest.fn(async () => undefined);

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    user: { passwordEnabled: true, updatePassword: mockUpdatePassword },
    isLoaded: true,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * The needed rules are shown after a change is tried — current password,
 * eight characters, and a matching confirmation — rather than silently
 * disabling the yellow action.
 */
describe("change-password validation", () => {
  it("shows every missing rule on the field it belongs to", async () => {
    const view = await render(<ChangePasswordScreen />);

    expect(screen.getByText("At least 8 characters.")).toBeTruthy();
    expect(screen.getByText("The one you sign in with now.")).toBeTruthy();
    expect(screen.getByText("Type it again so a typo cannot lock you out.")).toBeTruthy();

    fireEvent.press(screen.getByText("Change password"));

    expect(await screen.findByText(/Enter the password you sign in with now/)).toBeTruthy();
    expect(screen.getByText(/Use at least 8 characters/)).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
    await view.unmount();
  });
});
