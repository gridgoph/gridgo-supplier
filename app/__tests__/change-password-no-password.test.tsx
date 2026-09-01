import { render, screen } from "@testing-library/react-native";

import ChangePasswordScreen from "@/app/change-password";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    user: { passwordEnabled: false, updatePassword: jest.fn() },
    isLoaded: true,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("an account that only ever signed in with Google", () => {
  it("says there is no password to change", async () => {
    const view = await render(<ChangePasswordScreen />);

    expect(await screen.findByText("This account has no password")).toBeTruthy();
    expect(screen.getByText(/signs in with Google/)).toBeTruthy();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    await view.unmount();
  });
});
