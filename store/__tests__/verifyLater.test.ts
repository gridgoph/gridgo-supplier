import type { User } from "@/lib/api";
import { readVerification } from "@/lib/shopVerification";
import { isMatchable, isVerifiedShop, verifyLater } from "@/store/session";

/**
 * Report F318781A: a pending shop takes jobs once GRIDGO offers it, which the
 * verification summary on the session says. Without it, the old wait stands.
 */
const base: User = { id: "s1", email: "", name: "Owner", role: "supplier" };
const summary = readVerification({ verified: false, verificationState: "not_submitted" });

describe("taking jobs before verification", () => {
  it("keeps a pending shop waiting on an API that offers no summary", () => {
    const user = { ...base, verificationStatus: "pending" as const };
    expect(isMatchable(user)).toBe(false);
    expect(verifyLater(user)).toBe(false);
  });

  it("opens the floor to a pending shop GRIDGO lets take jobs", () => {
    const user = { ...base, verificationStatus: "pending" as const, verification: summary };
    expect(isMatchable(user)).toBe(true);
    expect(verifyLater(user)).toBe(true);
    expect(isVerifiedShop(user)).toBe(false);
  });

  it("never opens it to a rejected or suspended shop", () => {
    for (const status of ["rejected", "suspended"] as const) {
      expect(isMatchable({ ...base, verificationStatus: status, verification: summary })).toBe(false);
    }
  });

  it("treats an approved shop as verified, with nothing left to verify", () => {
    const user = { ...base, verificationStatus: "approved" as const };
    expect(isMatchable(user)).toBe(true);
    expect(isVerifiedShop(user)).toBe(true);
    expect(verifyLater(user)).toBe(false);
  });
});
