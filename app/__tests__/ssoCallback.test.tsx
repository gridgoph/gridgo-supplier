import { render, screen, waitFor } from "@testing-library/react-native";

import CallbackScreen from "@/app/sso-callback";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
}));

const mockRouter = jest.requireMock("expo-router").router as { replace: jest.Mock };

describe("Google SSO callback", () => {
  beforeEach(() => {
    mockRouter.replace.mockClear();
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: null,
    });
  });

  it("stays on Signing you in and does not dump onto Welcome", async () => {
    await render(<CallbackScreen />);

    expect(screen.getByText("Signing you in")).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("leaves Signing you in when the Google account is not a shop", async () => {
    useSession.setState({
      user: null,
      identity: { kind: "mismatch", destination: "GRIDGO for clients" },
      sessionWait: "in",
    });
    await render(<CallbackScreen />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/access");
    });
  });
});
