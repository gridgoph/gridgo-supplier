import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock("@/hooks/useTheme", () => ({
  useThemePreference: () => "system",
  setThemePreference: jest.fn(),
}));

import SettingsScreen from "@/app/settings";
import { router } from "expo-router";
import { setThemePreference } from "@/hooks/useTheme";

describe("Settings screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hosts the theme control (moved off Account)", async () => {
    await render(<SettingsScreen />);

    expect(screen.getByText("THEME")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
    expect(screen.getByText("Dark")).toBeTruthy();
  });

  it("updates the theme preference when a chip is pressed", async () => {
    await render(<SettingsScreen />);

    fireEvent.press(screen.getByText("Dark"));
    expect(setThemePreference).toHaveBeenCalledWith("dark");
  });

  it("opens onboarding as a settings replay, not a one-way trip", async () => {
    await render(<SettingsScreen />);

    fireEvent.press(screen.getByText("View onboarding"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/onboarding",
      params: { from: "settings" },
    });
  });
});
