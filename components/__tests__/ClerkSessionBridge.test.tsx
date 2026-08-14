import { Text } from "react-native";

import { render, waitFor } from "@testing-library/react-native";

import { ClerkSessionBridge } from "@/components/ClerkSessionBridge";
import * as api from "@/lib/api";
import { setClerkSignOutHandler, useSession } from "@/store/session";

const mockGetToken = jest.fn(async () => "clerk-token");
const mockSignOut = jest.fn(async () => undefined);

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: mockGetToken,
  }),
  useClerk: () => ({ signOut: mockSignOut }),
  useUser: () => ({
    user: {
      primaryEmailAddress: { emailAddress: "shop@example.com" },
      publicMetadata: { gridgoRole: "supplier" },
    },
  }),
}));

describe("ClerkSessionBridge supplier projection", () => {
  beforeEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
    api.setToken(null);
    api.setTokenProvider(null);
    setClerkSignOutHandler(null);
    jest.clearAllMocks();
  });

  afterEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
    setClerkSignOutHandler(null);
    jest.restoreAllMocks();
  });

  it.each([401, 403])(
    "turns an HTTP %s projection rejection into no-account access copy",
    async (status) => {
      jest
        .spyOn(api, "me")
        .mockRejectedValue(new api.ApiError(status, { error: "forbidden" }));

      const view = await render(
        <ClerkSessionBridge>
          <Text>Supplier shell</Text>
        </ClerkSessionBridge>,
      );

      await waitFor(() => {
        expect(useSession.getState().identity.kind).toBe("error");
      });
      const identity = useSession.getState().identity;
      expect(identity).toMatchObject({ kind: "error", email: "shop@example.com" });
      if (identity.kind === "error") {
        expect(identity.message).toMatch(/no supplier account/i);
        expect(identity.message).toMatch(/apply as a shop/i);
        expect(identity.message).toMatch(/Operations/);
      }

      view.unmount();
    },
  );
});
