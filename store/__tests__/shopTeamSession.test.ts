import * as api from "@/lib/api";
import { authDoorOpen, launchHref } from "@/lib/launch";
import { useJobDrafts } from "@/store/jobDrafts";
import {
  isShopOwner,
  isShopStaff,
  setClerkSignOutHandler,
  signedOutWithNotice,
  TEAM_REMOVED_MESSAGE,
  useSession,
} from "@/store/session";
import { useTeamJoin } from "@/store/teamJoin";

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

const staffBootstrap = {
  user: { id: "user_456", name: "Sam Santos", role: "supplier" },
  shop: { id: "supplier_123", name: "Print Shop", role: "staff", status: "active" },
  memberships: [{ role: "supplier" }],
  approvalCases: [],
};

const ownerResponse = {
  user: { id: "supplier_123", email: "ana@shop.ph", name: "Ana", role: "supplier" },
  memberships: [{ role: "supplier" }],
  approvalCases: [{ kind: "supplier", status: "approved" }],
};

beforeEach(() => {
  api.setToken(null);
  api.setTokenProvider(async () => "clerk-token");
  useSession.setState({
    user: null,
    loading: false,
    error: null,
    authSource: "clerk",
    identity: { kind: "loading" },
    sessionWait: null,
  });
});

afterEach(() => {
  api.setTokenProvider(null);
  jest.restoreAllMocks();
});

describe("a teammate's bootstrap", () => {
  it("reads Staff as the person, on the shop, approved for work", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    const user = await api.me();
    expect(user).toMatchObject({
      id: "user_456",
      role: "supplier",
      supplierName: "Print Shop",
      shopId: "supplier_123",
      shopRole: "staff",
      shopStatus: "active",
      verificationStatus: "approved",
    });
    expect(isShopStaff(user)).toBe(true);
    expect(isShopOwner(user)).toBe(false);
  });

  it("leaves the shop's own account exactly as before: an Owner", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, ownerResponse));
    const user = await api.me();
    expect(user.shopRole).toBeUndefined();
    expect(user.verificationStatus).toBe("approved");
    expect(isShopOwner(user)).toBe(true);
    expect(isShopStaff(user)).toBe(false);
  });

  it("holds a pending teammate on the waiting screen, outside the shop", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      response(200, { ...staffBootstrap, shop: { ...staffBootstrap.shop, status: "pending" } }),
    );
    const user = await api.me();
    expect(useSession.getState().adoptClerkUser(user)).toBe(false);
    const state = useSession.getState();
    expect(state.user).toBeNull();
    expect(state.identity).toEqual({ kind: "team_pending", shopName: "Print Shop" });
    expect(launchHref(state.identity, state.user)).toBe("/team-waiting");
    expect(authDoorOpen(state.identity, state.user)).toBe(false);
  });

  it("opens Staff on Jobs and an Owner on Home", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    useSession.getState().adoptClerkUser(await api.me());
    expect(launchHref(useSession.getState().identity, useSession.getState().user)).toBe("/(tabs)/jobs");

    jest.spyOn(global, "fetch").mockResolvedValue(response(200, ownerResponse));
    useSession.getState().adoptClerkUser(await api.me());
    expect(launchHref(useSession.getState().identity, useSession.getState().user)).toBe("/(tabs)/home");
  });
});

describe("removal and approval refusals", () => {
  it("drops the shop and says so the moment any request is refused as removed", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    useSession.getState().adoptClerkUser(await api.me());
    expect(useSession.getState().user?.id).toBe("user_456");

    jest.spyOn(global, "fetch").mockResolvedValue(response(403, { error: "shop_access_removed" }));
    await expect(api.listJobs()).rejects.toBeInstanceOf(api.ApiError);

    const state = useSession.getState();
    expect(state.user).toBeNull();
    expect(state.identity).toEqual({ kind: "signed_out", reason: "team_removed" });
    expect(state.authSource).toBe("none");
    expect(launchHref(state.identity, state.user)).toBe("/(auth)/login");
  });

  it("ends this app's Clerk session once, and keeps the explanation while Clerk lets go", async () => {
    const signOut = jest.fn(async () => {});
    setClerkSignOutHandler(signOut);
    useJobDrafts.getState().setNote("order_1", "Customer wants matte");
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    useSession.getState().adoptClerkUser(await api.me());

    useSession.getState().teamAccessRemoved();
    // The stream event and a refused request can both arrive.
    useSession.getState().teamAccessRemoved();
    // Clerk reporting signed-out must not wipe the sentence.
    useSession.getState().clearClerkIdentity();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(useSession.getState().identity).toEqual({ kind: "signed_out", reason: "team_removed" });
    expect(useJobDrafts.getState().drafts).toEqual({});
    expect(signedOutWithNotice(useSession.getState().identity)).toBe(true);
    // Never more than this app's own session: no user, ban or other-session call.
    expect(signOut).toHaveBeenCalledWith();
    setClerkSignOutHandler(null);
  });

  it("keeps the session of someone joining with a new invite, so they can claim it", async () => {
    const signOut = jest.fn(async () => {});
    setClerkSignOutHandler(signOut);
    useTeamJoin.getState().startJoining();
    useSession.getState().teamAccessRemoved();
    expect(signOut).not.toHaveBeenCalled();
    expect(useSession.getState().identity).toEqual({ kind: "error", reason: "team_removed", message: TEAM_REMOVED_MESSAGE });
    useTeamJoin.getState().clear();
    setClerkSignOutHandler(null);
  });

  it("signs a working teammate out even if an old join tap left the intent set", async () => {
    const signOut = jest.fn(async () => {});
    setClerkSignOutHandler(signOut);
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    useSession.getState().adoptClerkUser(await api.me());
    useTeamJoin.getState().startJoining();
    useSession.getState().teamAccessRemoved();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(useSession.getState().identity).toEqual({ kind: "signed_out", reason: "team_removed" });
    useTeamJoin.getState().clear();
    setClerkSignOutHandler(null);
  });

  it("lets a new sign-in attempt clear the removal notice", () => {
    useSession.setState({ authSource: "none", identity: { kind: "signed_out", reason: "team_removed" } });
    useSession.getState().clearSignInRefusal();
    expect(useSession.getState().identity).toEqual({ kind: "signed_out" });
  });

  it("re-reads standing when a request says approval is pending", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    useSession.getState().adoptClerkUser(await api.me());

    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(response(403, { error: "shop_approval_pending" }))
      .mockResolvedValue(response(200, { ...staffBootstrap, shop: { ...staffBootstrap.shop, status: "pending" } }));
    await expect(api.listJobs()).rejects.toBeInstanceOf(api.ApiError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/auth/me"))).toBe(true);
    expect(useSession.getState().identity.kind).toBe("team_pending");
  });

  it("treats an Owner-only refusal as an ordinary error, not a removal", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(response(200, staffBootstrap));
    useSession.getState().adoptClerkUser(await api.me());
    jest.spyOn(global, "fetch").mockResolvedValue(response(403, { error: "shop_owner_required" }));
    await expect(api.getShopTeam()).rejects.toBeInstanceOf(api.ApiError);
    expect(useSession.getState().user?.id).toBe("user_456");
  });
});

describe("team routes", () => {
  it("sends each route the body GRIDGO's contract names", async () => {
    const fetch = jest.spyOn(global, "fetch").mockImplementation(async () =>
      response(200, {
        invite: { id: "shi_1", kind: "email", status: "open" },
        token: "tok",
        member: { userId: "u" },
        invites: [],
        members: [],
        shop: { id: "supplier_123", name: "Print Shop", role: "staff", status: "pending" },
      }),
    );
    await api.createShopInvite("email", "sam@example.com");
    await api.createShopInvite("qr");
    await api.revokeShopInvite("shi_1");
    await api.updateShopMember("user_456", { status: "active" });
    await api.removeShopMember("user_456");
    await api.discoverShopInvites();
    const claimed = await api.claimShopInvite({ token: "tok" });

    const calls = fetch.mock.calls.map(([url, init]) => [
      String(url).replace(/^https?:\/\/[^/]+/, ""),
      init?.method,
      init?.body,
    ]);
    expect(calls).toEqual([
      ["/me/shop-team/invites", "POST", JSON.stringify({ kind: "email", identity: "sam@example.com" })],
      ["/me/shop-team/invites", "POST", JSON.stringify({ kind: "qr" })],
      ["/me/shop-team/invites/shi_1", "DELETE", undefined],
      ["/me/shop-team/members/user_456", "PATCH", JSON.stringify({ status: "active" })],
      ["/me/shop-team/members/user_456", "DELETE", undefined],
      ["/auth/shop-invites", "POST", "{}"],
      ["/auth/shop-invites/claim", "POST", JSON.stringify({ token: "tok" })],
    ]);
    expect(claimed).toEqual({ id: "supplier_123", name: "Print Shop", role: "staff", status: "pending" });
  });
});
