import * as api from "@/lib/api";
import { enterAfterClerkSession, hrefAfterClerkAuth } from "@/lib/afterClerkAuth";
import { useSession } from "@/store/session";

const supplier = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier" as const,
  supplierName: "PrintRight",
  verificationStatus: "pending" as const,
};

describe("enterAfterClerkSession", () => {
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
    jest.restoreAllMocks();
  });

  it("adopts a pending supplier and sends them to Home", async () => {
    jest.spyOn(api, "me").mockResolvedValue(supplier);

    const result = await enterAfterClerkSession(async () => "clerk-jwt");

    expect(result).toEqual({ kind: "home" });
    expect(hrefAfterClerkAuth({ kind: "home" })).toBe("/(tabs)/home");
    expect(useSession.getState()).toMatchObject({
      user: { id: "u1", verificationStatus: "pending" },
      identity: { kind: "supplier" },
    });
  });

  it("sends a Clerk identity with no membership into apply, not access", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unauthorized" }));

    const result = await enterAfterClerkSession(async () => "clerk-jwt");

    expect(result).toEqual({ kind: "apply" });
    expect(hrefAfterClerkAuth({ kind: "apply" })).toBe("/(auth)/signup");
    expect(hrefAfterClerkAuth({ kind: "apply" })).not.toBe("/access");
    expect(useSession.getState().identity.kind).toBe("unassigned");
  });

  it("waits for a live JWT before asking /auth/me", async () => {
    const getToken = jest
      .fn<Promise<string | null>, [{ skipCache?: boolean }?]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("clerk-jwt");
    const me = jest.spyOn(api, "me").mockResolvedValue(supplier);

    const result = await enterAfterClerkSession(getToken);

    expect(getToken).toHaveBeenCalled();
    expect(me).toHaveBeenCalledWith({ ignoreUnauthorized: true });
    expect(result).toEqual({ kind: "home" });
  });
});
