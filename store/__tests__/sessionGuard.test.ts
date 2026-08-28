import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as api from "@/lib/api";
import {
  isMatchable,
  isSignedIn,
  setClerkSignOutHandler,
  useSession,
} from "@/store/session";

const supplierUser = {
  id: "u1",
  email: "supplier@gridgo.local",
  name: "Supplier Demo",
  role: "supplier" as const,
  supplierName: "Demo Print Shop",
};

describe("isSignedIn (Stack.Protected guard source)", () => {
  it("is true only when a user is present", () => {
    expect(isSignedIn(null)).toBe(false);
    expect(isSignedIn(undefined)).toBe(false);
    expect(isSignedIn(supplierUser)).toBe(true);
  });
});

describe("isMatchable", () => {
  it("is true only after Operations has approved the shop", () => {
    expect(isMatchable(null)).toBe(false);
    expect(isMatchable({ ...supplierUser, verificationStatus: "pending" })).toBe(false);
    expect(isMatchable({ ...supplierUser, verificationStatus: "rejected" })).toBe(false);
    expect(isMatchable({ ...supplierUser, verificationStatus: "approved" })).toBe(true);
  });
});

describe("session clearing paths feed the same guard", () => {
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
  });

  afterEach(() => {
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
    jest.restoreAllMocks();
  });

  it("logout nulls user so isSignedIn becomes false", async () => {
    useSession.setState({ user: supplierUser });
    api.setToken("demo-token");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);

    await useSession.getState().logout();

    expect(useSession.getState().user).toBeNull();
    expect(isSignedIn(useSession.getState().user)).toBe(false);
    expect(api.getToken()).toBeNull();
  });

  it("HTTP 401 clears token and user without call-site redirects", async () => {
    useSession.setState({ user: supplierUser });
    api.setToken("stale-token");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    } as Response);

    await expect(api.me()).rejects.toBeInstanceOf(api.ApiError);

    expect(api.getToken()).toBeNull();
    expect(useSession.getState().user).toBeNull();
    expect(isSignedIn(useSession.getState().user)).toBe(false);
  });

  it("rejected role leaves user null (guard stays closed)", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/login") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              token: "t",
              user: { ...supplierUser, role: "client", id: "c1" },
            }),
        } as Response;
      }
      // logout after role reject
      return { ok: true, status: 200, text: async () => "" } as Response;
    });

    await useSession.getState().login("client@gridgo.local", "demo");

    expect(useSession.getState().user).toBeNull();
    expect(isSignedIn(useSession.getState().user)).toBe(false);
    // The message names the app to open, never the platform's role string.
    const error = useSession.getState().error ?? "";
    expect(error).toContain("GRIDGO for clients");
    expect(error).not.toMatch(/\brole\b/i);
    expect(error).not.toContain("client\"");
  });

  it("adopts a Clerk supplier after enroll succeeds", async () => {
    jest.spyOn(api, "enrollSupplier").mockResolvedValue({
      ...supplierUser,
      verificationStatus: "pending",
    });

    const ok = await useSession.getState().enrollSupplier(
      {
        profile: {
          shopName: "PrintRight",
          contactName: "Ben",
          phone: "09171234567",
          location: { lat: 7.06, lng: 125.6, label: "Davao" },
        },
        serviceCategories: ["marketing_collateral"],
      },
      "supplier-enroll-ok",
    );

    expect(ok).toBe(true);
    expect(useSession.getState()).toMatchObject({
      user: { id: "u1", role: "supplier" },
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
  });

  it("enrolls through Clerk and does not treat a 404 as offline", async () => {
    const enroll = jest.spyOn(api, "enrollSupplier").mockRejectedValue(
      new api.ApiError(404, { error: "not_found" }),
    );

    const ok = await useSession.getState().enrollSupplier(
      {
        profile: {
          shopName: "PrintRight",
          contactName: "Ben",
          phone: "09171234567",
          location: { lat: 7.06, lng: 125.6, label: "Davao" },
        },
        serviceCategories: ["marketing_collateral"],
      },
      "supplier-enroll-test",
    );

    expect(ok).toBe(false);
    expect(enroll).toHaveBeenCalledTimes(1);
    const error = useSession.getState().error ?? "";
    expect(error).not.toMatch(/Cannot reach GRIDGO/);
    expect(error).not.toMatch(/connection/);
  });

  it("adopts only a supplier projected by the API", () => {
    useSession.getState().setClerkIdentity({ kind: "loading" });

    expect(useSession.getState().adoptClerkUser(supplierUser)).toBe(true);
    expect(useSession.getState().authSource).toBe("clerk");
    expect(useSession.getState().identity).toEqual({ kind: "supplier" });

    expect(
      useSession.getState().adoptClerkUser({ ...supplierUser, role: "client" }),
    ).toBe(false);
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().identity).toEqual({
      kind: "mismatch",
      destination: "GRIDGO for clients",
    });
  });

  it("signs out Clerk after sending GRIDGO the device release", async () => {
    const clerkSignOut = jest.fn(async () => undefined);
    setClerkSignOutHandler(clerkSignOut);
    useSession.setState({
      user: supplierUser,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
    api.setTokenProvider(async () => "clerk-token");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    } as Response);

    await useSession.getState().logout();

    expect(clerkSignOut).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({
      user: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  it("signs out an unassigned Clerk identity without inventing a GRIDGO session", async () => {
    const clerkSignOut = jest.fn(async () => undefined);
    const fetch = jest.spyOn(global, "fetch");
    setClerkSignOutHandler(clerkSignOut);
    useSession.setState({
      user: null,
      authSource: "clerk",
      identity: { kind: "unassigned", email: "shop@example.com" },
    });

    await useSession.getState().logout();

    expect(fetch).not.toHaveBeenCalled();
    expect(clerkSignOut).toHaveBeenCalledTimes(1);
  });

  it("does not let Clerk's signed-out state erase the local demo session", () => {
    useSession.setState({
      user: supplierUser,
      authSource: "legacy",
      identity: { kind: "supplier" },
    });

    useSession.getState().clearClerkIdentity();

    expect(useSession.getState().user).toEqual(supplierUser);
    expect(useSession.getState().authSource).toBe("legacy");
  });
});

describe("root stack auth guard wiring", () => {
  it("keeps Stack.Protected over the signed-in area including pushed routes", () => {
    const layoutPath = join(__dirname, "../../app/_layout.tsx");
    const src = readFileSync(layoutPath, "utf8");

    expect(src).toContain("Stack.Protected");
    expect(src).toContain("isSignedIn");
    // Tabs alone are not enough — detail screens live outside the tab group.
    expect(src).toMatch(/guard=\{signedIn\}[\s\S]*name="\(tabs\)"/);
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="job\/\[id\]"/);
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="payout"/);
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="design-system"/);
    // Tabs are for every signed-in shop; job money screens stay matchable.
    const tabsAt = src.indexOf('name="(tabs)"');
    const matchableAt = src.indexOf("guard={matchable}");
    expect(tabsAt).toBeGreaterThan(-1);
    expect(matchableAt).toBeGreaterThan(-1);
    expect(tabsAt).toBeLessThan(matchableAt);
    // Login is the complementary unauthenticated half of the pair. The door
    // stays mounted while Clerk restores — a loading-only guard left a black
    // canvas because welcome was unmounted and index painted nothing.
    expect(src).toContain("authDoorOpen");
    expect(src).toContain("const signedOut = authDoorOpen(identity, user);");
    expect(src).toMatch(/guard=\{signedOut\}[\s\S]*name="\(auth\)\/login"/);
    expect(src).toMatch(/guard=\{accessBlocked\}[\s\S]*name="access"/);
  });
});
