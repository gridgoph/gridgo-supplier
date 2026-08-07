import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as api from "@/lib/api";
import { isSignedIn, useSession } from "@/store/session";

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

describe("session clearing paths feed the same guard", () => {
  beforeEach(() => {
    useSession.setState({ user: null, loading: false, error: null });
    api.setToken(null);
  });

  afterEach(() => {
    useSession.setState({ user: null, loading: false, error: null });
    api.setToken(null);
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
    expect(useSession.getState().error).toMatch(/role "client"/);
  });
});

describe("root stack auth guard wiring", () => {
  it("keeps Stack.Protected over the signed-in area including pushed routes", () => {
    const layoutPath = join(__dirname, "../../app/_layout.tsx");
    const src = readFileSync(layoutPath, "utf8");

    expect(src).toContain("Stack.Protected");
    expect(src).toContain("isSignedIn");
    // Tabs alone are not enough — detail screens live outside the tab group.
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="\(tabs\)"/);
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="job\/\[id\]"/);
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="payout"/);
    expect(src).toMatch(/Stack\.Protected[\s\S]*name="design-system"/);
    // Login is the complementary unauthenticated half of the pair.
    expect(src).toMatch(/guard=\{!signedIn\}[\s\S]*name="\(auth\)\/login"/);
  });
});
