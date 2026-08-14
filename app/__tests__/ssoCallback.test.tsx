import { render, screen, waitFor } from "@testing-library/react-native";

import CallbackScreen from "@/app/sso-callback";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
}));

const mockRouter = jest.requireMock("expo-router").router as { replace: jest.Mock };

describe("Google SSO callback", () => {
  it("matches the default callback, stays quiet, and replaces to launch", async () => {
    await render(<CallbackScreen />);

    expect(screen.getByText("Signing you in…")).toBeTruthy();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
  });
});
