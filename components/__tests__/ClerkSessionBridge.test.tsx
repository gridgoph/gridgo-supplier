import { Text } from "react-native";

import { act, render, waitFor } from "@testing-library/react-native";

import { ClerkSessionBridge } from "@/components/ClerkSessionBridge";
import * as api from "@/lib/api";
import { launchHref } from "@/lib/launch";
import { setClerkSignOutHandler, useSession } from "@/store/session";

let mockRole = "supplier";
let mockIsSignedIn = true;
let mockClerkUser: {
  primaryEmailAddress?: { emailAddress: string };
  publicMetadata?: Record<string, unknown>;
} | null = {
  primaryEmailAddress: { emailAddress: "shop@example.com" },
  publicMetadata: { gridgoRole: "supplier" },
};
const mockGetToken = jest.fn(async () => "clerk-token");
const mockSignOut = jest.fn(async () => undefined);

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: mockIsSignedIn,
    getToken: mockGetToken,
  }),
  useClerk: () => ({ signOut: mockSignOut }),
  useUser: () => ({
    user: mockClerkUser
      ? { ...mockClerkUser, publicMetadata: { gridgoRole: mockRole, ...mockClerkUser.publicMetadata } }
      : null,
  }),
}));

describe("ClerkSessionBridge supplier projection", () => {
  beforeEach(() => {
    mockRole = "supplier";
    mockIsSignedIn = true;
    mockClerkUser = {
      primaryEmailAddress: { emailAddress: "shop@example.com" },
      publicMetadata: { gridgoRole: "supplier" },
    };
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

  it(
    "explains withdrawn supplier access after a forbidden projection",
    async () => {
      jest
        .spyOn(api, "me")
        .mockRejectedValue(new api.ApiError(403, { error: "forbidden" }));

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
        expect(identity.message).toMatch(/access was withdrawn/i);
        expect(identity.message).toMatch(/Operations/);
      }

      view.unmount();
    },
  );

  it("keeps an expired restored session on sign-in across Clerk user updates", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unauthorized" }));
    const view = await render(<ClerkSessionBridge><Text>Shell</Text></ClerkSessionBridge>);
    await waitFor(() => {
      const { identity, user } = useSession.getState();
      expect(launchHref(identity, user)).toBe("/(auth)/login");
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    mockClerkUser = { ...mockClerkUser };
    await view.rerender(<ClerkSessionBridge><Text>Updated shell</Text></ClerkSessionBridge>);
    expect(api.me).toHaveBeenCalledTimes(1);
    mockIsSignedIn = false;
    await view.rerender(<ClerkSessionBridge><Text>Signed out shell</Text></ClerkSessionBridge>);
    const { identity, user } = useSession.getState();
    expect(launchHref(identity, user)).toBe("/(auth)/login");
    await view.unmount();
  });

  it("refreshes a rejected bearer through Clerk's cache-bypassing option", async () => {
    useSession.getState().adoptClerkUser({
      id: "u1", email: "shop@example.com", name: "Shop", role: "supplier", verificationStatus: "approved",
    });
    const fetch = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => JSON.stringify({ error: "unauthorized" }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ jobs: [] }) } as Response);
    const view = await render(<ClerkSessionBridge><Text>Shell</Text></ClerkSessionBridge>);
    await act(async () => { await expect(api.listJobs()).resolves.toEqual([]); });
    expect(mockGetToken.mock.calls).toEqual([[undefined], [{ skipCache: true }]]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(useSession.getState().identity.kind).toBe("supplier");
    await view.unmount();
  });

  it("does not re-ask /auth/me when the shop is already adopted", async () => {
    const shop = {
      id: "u1",
      email: "shop@example.com",
      name: "Ben",
      role: "supplier" as const,
      verificationStatus: "approved" as const,
    };
    useSession.setState({
      user: shop,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
    const me = jest.spyOn(api, "me").mockResolvedValue(shop);

    const view = await render(
      <ClerkSessionBridge>
        <Text>Supplier shell</Text>
      </ClerkSessionBridge>,
    );

    await waitFor(async () => {
      await expect(api.getAuthToken()).resolves.toBe("clerk-token");
    });
    expect(me).not.toHaveBeenCalled();
    expect(useSession.getState().identity.kind).toBe("supplier");

    view.unmount();
  });

  it("does not drop an adopted shop when Clerk is signed in but useUser has not arrived", async () => {
    mockClerkUser = null;
    const shop = {
      id: "u1",
      email: "shop@example.com",
      name: "Ben",
      role: "supplier" as const,
      verificationStatus: "approved" as const,
    };
    useSession.setState({
      user: shop,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
    jest.spyOn(api, "me").mockImplementation(() => new Promise(() => {}));

    const view = await render(
      <ClerkSessionBridge>
        <Text>Supplier shell</Text>
      </ClerkSessionBridge>,
    );

    expect(useSession.getState().user?.id).toBe("u1");
    expect(useSession.getState().identity.kind).toBe("supplier");

    view.unmount();
  });

  it("adopts from /auth/me when Clerk is signed in before useUser arrives", async () => {
    mockClerkUser = null;
    const shop = {
      id: "u1",
      email: "shop@example.com",
      name: "Ben",
      role: "supplier" as const,
      verificationStatus: "approved" as const,
    };
    jest.spyOn(api, "me").mockResolvedValue(shop);

    const view = await render(
      <ClerkSessionBridge>
        <Text>Supplier shell</Text>
      </ClerkSessionBridge>,
    );

    await waitFor(() => {
      expect(useSession.getState().user?.id).toBe("u1");
    });
    expect(useSession.getState().identity.kind).toBe("supplier");

    view.unmount();
  });
});

it("probes supplier membership when Clerk's primary role is client",async()=>{
  mockRole="client";
  mockIsSignedIn=true;
  mockClerkUser={
    primaryEmailAddress:{emailAddress:"dual@test"},
    publicMetadata:{gridgoRole:"client"},
  };
  useSession.setState({
    user:null,
    loading:false,
    error:null,
    authSource:"none",
    identity:{kind:"signed_out"},
  });
  const member={id:"dual",role:"supplier" as const,name:"Dual",email:"dual@test",verificationStatus:"approved" as const};
  jest.spyOn(api,"me").mockResolvedValue(member);
  const view=await render(<ClerkSessionBridge><Text>Shell</Text></ClerkSessionBridge>);
  await waitFor(()=>expect(useSession.getState().user?.id).toBe("dual"));
  expect(mockSignOut).not.toHaveBeenCalled();
  await view.unmount();jest.restoreAllMocks();api.setTokenProvider(null);
});
