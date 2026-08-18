import { launchHref } from "@/lib/launch";
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

  it("waits while Clerk is still restoring", () => {
    expect(launchHref({ kind: "loading" }, null)).toBeNull();
  });
});
