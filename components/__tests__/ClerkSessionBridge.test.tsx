import { Text } from "react-native";

import { render, waitFor } from "@testing-library/react-native";

import { ClerkSessionBridge } from "@/components/ClerkSessionBridge";
import * as api from "@/lib/api";
import { setClerkSignOutHandler, useSession } from "@/store/session";

let mockRole = "supplier";
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
      publicMetadata: { gridgoRole: mockRole },
    },
  }),
}));

describe("ClerkSessionBridge supplier projection", () => {
  beforeEach(() => {
    mockRole = "supplier";
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

it("probes supplier membership when Clerk's primary role is client",async()=>{
  mockRole="client";
  const member={id:"dual",role:"supplier" as const,name:"Dual",email:"dual@test",verificationStatus:"approved" as const};
  jest.spyOn(api,"me").mockResolvedValue(member);
  const view=await render(<ClerkSessionBridge><Text>Shell</Text></ClerkSessionBridge>);
  await waitFor(()=>expect(useSession.getState().user?.id).toBe("dual"));
  expect(mockSignOut).not.toHaveBeenCalled();
  await view.unmount();jest.restoreAllMocks();api.setTokenProvider(null);
});
