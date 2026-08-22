import * as api from "@/lib/api";
import {
  enterAfterClerkSession,
  hrefAfterClerkAuth,
  emailUnavailableMessage,
  gridgoUnreachableMessage,
  leftoverActionForTypedEmail,
  supplierDoorForClerkSession,
} from "@/lib/afterClerkAuth";
import { useSession } from "@/store/session";
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";

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
    useSignupDraft.setState({ draft: EMPTY_SIGNUP_DRAFT, hydrated: true });
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
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));

    const result = await enterAfterClerkSession(async () => "clerk-jwt");

    expect(result).toEqual({ kind: "apply" });
    expect(hrefAfterClerkAuth({ kind: "apply" })).toBe("/(auth)/signup");
    expect(hrefAfterClerkAuth({ kind: "apply" })).not.toBe("/access");
    expect(useSession.getState().identity.kind).toBe("unassigned");
  });

  it("does not open apply when the token itself is rejected", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unauthorized" }));

    const result = await enterAfterClerkSession(async () => "clerk-jwt");

    expect(result.kind).toBe("blocked");
    expect(useSession.getState().identity.kind).not.toBe("unassigned");
  });

  it("stays on Sign in when GRIDGO is unreachable, rather than opening apply", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new TypeError("Network request failed"));

    const result = await enterAfterClerkSession(async () => "clerk-jwt");

    expect(result).toEqual({
      kind: "blocked",
      message: gridgoUnreachableMessage,
    });
    expect(useSession.getState().identity.kind).not.toBe("unassigned");
  });

  it("resumes apply at the first unfinished step when a draft is already on the phone", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));
    useSignupDraft.setState({
      draft: {
        ...EMPTY_SIGNUP_DRAFT,
        shopName: "Mark Prints",
        contactName: "Mark David",
        email: "shop@example.com",
        phone: "09975643866",
      },
    });

    await enterAfterClerkSession(async () => "clerk-jwt");

    expect(hrefAfterClerkAuth({ kind: "apply" })).toBe("/(auth)/signup/location");
  });

  it("keeps a client identity on Sign in, not the closed-shop screen", async () => {
    jest.spyOn(api, "me").mockResolvedValue({
      id: "c1",
      email: "mark@example.com",
      name: "Mark",
      role: "client",
    });

    const result = await enterAfterClerkSession(async () => "clerk-jwt");

    expect(result).toEqual({
      kind: "blocked",
      message: emailUnavailableMessage,
    });
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().identity.kind).not.toBe("mismatch");
    expect(useSession.getState().identity.kind).not.toBe("supplier");
  });

  it("opens apply at the door only for an unmapped identity", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));
    await expect(supplierDoorForClerkSession(async () => "clerk-jwt")).resolves.toBe("apply");
  });

  it("does not treat a dead token as a new shop at the door", async () => {
    jest.spyOn(api, "me").mockRejectedValue(new api.ApiError(401, { error: "unauthorized" }));
    await expect(supplierDoorForClerkSession(async () => "clerk-jwt")).resolves.toBe("unknown");
  });

  it("names a live client JWT as the wrong app before any email code is sent", async () => {
    jest.spyOn(api, "me").mockResolvedValue({
      id: "c1",
      email: "mark@example.com",
      name: "Mark",
      role: "client",
    });

    await expect(supplierDoorForClerkSession(async () => "clerk-jwt")).resolves.toBe("wrong_app");
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

describe("leftoverActionForTypedEmail", () => {
  const unassigned = { kind: "unassigned" as const };
  const mismatch = {
    kind: "mismatch" as const,
    destination: "GRIDGO for clients",
  };

  it("clears a leftover client session when a different email is typed", () => {
    expect(
      leftoverActionForTypedEmail({
        leftoverEmail: "client@example.com",
        typedEmail: "shop@example.com",
        leftoverDoor: "wrong_app",
        leftoverAccess: unassigned,
      }),
    ).toBe("clear");
  });

  it("refuses when the leftover non-shop is the same email that was typed", () => {
    expect(
      leftoverActionForTypedEmail({
        leftoverEmail: "client@example.com",
        typedEmail: "client@example.com",
        leftoverDoor: "wrong_app",
        leftoverAccess: unassigned,
      }),
    ).toBe("refuse");
  });

  it("clears when leftover email is missing, even if that session is the wrong app", () => {
    expect(
      leftoverActionForTypedEmail({
        leftoverEmail: null,
        typedEmail: "shop@example.com",
        leftoverDoor: "wrong_app",
        leftoverAccess: unassigned,
      }),
    ).toBe("clear");
  });

  it("clears a leftover shop so the typed password can run", () => {
    expect(
      leftoverActionForTypedEmail({
        leftoverEmail: "shop@example.com",
        typedEmail: "shop@example.com",
        leftoverDoor: "supplier",
        leftoverAccess: unassigned,
      }),
    ).toBe("clear");
  });

  it("refuses a leftover Clerk role mismatch for the same email", () => {
    expect(
      leftoverActionForTypedEmail({
        leftoverEmail: "client@example.com",
        typedEmail: "CLIENT@example.com",
        leftoverDoor: "unknown",
        leftoverAccess: mismatch,
      }),
    ).toBe("refuse");
  });
});
