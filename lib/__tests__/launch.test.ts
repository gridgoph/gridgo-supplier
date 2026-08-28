import { authDoorOpen, launchHref } from "@/lib/launch";
import type { User } from "@/lib/api";
import type { IdentityState } from "@/store/session";

const pendingShop: User = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier",
  supplierName: "PrintRight",
  verificationStatus: "pending",
};

const approvedShop: User = { ...pendingShop, verificationStatus: "approved" };

describe("launchHref", () => {
  it("sends a pending supplier to Home, not accreditation or the closed shop", () => {
    const identity: IdentityState = { kind: "supplier" };
    expect(launchHref(identity, pendingShop)).toBe("/(tabs)/home");
    expect(launchHref(identity, pendingShop)).not.toBe("/accreditation" as never);
    expect(launchHref(identity, pendingShop)).not.toBe("/access");
  });

  it("sends an approved supplier to Home", () => {
    expect(launchHref({ kind: "supplier" }, approvedShop)).toBe("/(tabs)/home");
  });

  it("does not send an unassigned Clerk identity to the closed-shop screen", () => {
    expect(launchHref({ kind: "unassigned", email: "shop@example.com" }, null)).toBe(
      "/(auth)/welcome",
    );
    expect(launchHref({ kind: "unassigned", email: "shop@example.com" }, null)).not.toBe(
      "/access",
    );
  });

  it("keeps a mismatched account on access", () => {
    expect(
      launchHref({ kind: "mismatch", destination: "GRIDGO for clients" }, null),
    ).toBe("/access");
  });

  it("sends a restoring session to the door, never a blank screen", () => {
    expect(launchHref({ kind: "loading" }, null)).toBe("/(auth)/welcome");
  });

  it("never returns null — a blank index is a black canvas on a dark phone", () => {
    const identities: IdentityState[] = [
      { kind: "loading" },
      { kind: "signed_out" },
      { kind: "unassigned", email: "shop@example.com" },
      { kind: "mismatch", destination: "GRIDGO for clients" },
      { kind: "error", message: "GRIDGO could not open this shop" },
      { kind: "supplier" },
    ];
    for (const identity of identities) {
      expect(launchHref(identity, null)).not.toBeNull();
      expect(launchHref(identity, pendingShop)).not.toBeNull();
    }
  });
});

describe("authDoorOpen", () => {
  it("keeps welcome mounted while Clerk is still restoring", () => {
    expect(authDoorOpen({ kind: "loading" }, null)).toBe(true);
    expect(authDoorOpen({ kind: "signed_out" }, null)).toBe(true);
    expect(authDoorOpen({ kind: "unassigned", email: "shop@example.com" }, null)).toBe(
      true,
    );
  });

  it("closes the door once a shop is signed in or access is blocked", () => {
    expect(authDoorOpen({ kind: "supplier" }, pendingShop)).toBe(false);
    expect(
      authDoorOpen({ kind: "mismatch", destination: "GRIDGO for clients" }, null),
    ).toBe(false);
    expect(authDoorOpen({ kind: "error", message: "offline" }, null)).toBe(false);
  });
});
