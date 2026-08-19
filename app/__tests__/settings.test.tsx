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
import { useSession } from "@/store/session";

describe("Settings screen", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({
      user: {
        id: "u1",
        email: "shop@example.com",
        name: "Ben",
        role: "supplier",
        supplierName: "PrintRight",
        verificationStatus: "pending",
      },
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  it("hosts the theme control (moved off Account)", async () => {
    view = await render(<SettingsScreen />);

    expect(screen.getByText("THEME")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
    expect(screen.getByText("Dark")).toBeTruthy();
  });

  it("updates the theme preference when a chip is pressed", async () => {
    view = await render(<SettingsScreen />);

    fireEvent.press(screen.getByText("Dark"));
    expect(setThemePreference).toHaveBeenCalledWith("dark");
  });

  it("offers accreditation from Settings while Operations is reviewing", async () => {
    view = await render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("Accreditation"));
    expect(router.push).toHaveBeenCalledWith("/accreditation");
  });

  it("opens onboarding as a settings replay, not a one-way trip", async () => {
    view = await render(<SettingsScreen />);

    fireEvent.press(screen.getByText("View onboarding"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/onboarding",
      params: { from: "settings" },
    });
  });

  it("does not show the GRIDGO address", async () => {
    view = await render(<SettingsScreen />);

    expect(screen.queryByText("CONNECTION")).toBeNull();
    expect(screen.queryByText("GRIDGO address")).toBeNull();
  });
});
