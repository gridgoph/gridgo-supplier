import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("invitation-first Clerk routes", () => {
  it("matches the supplied sign-in hierarchy without a public account creator", () => {
    const login = source("app/(auth)/login.tsx");

    expect(login).toContain("Welcome Back.");
    expect(login).toContain("Let’s sign in");
    expect(login).toContain("Recover Password");
    expect(login).toContain("GoogleSignInButton");
    expect(login).toContain("Ask Operations to invite this email");
    expect(login).not.toContain("Open a shop account");
    expect(login).not.toMatch(/signUp\.|signupSupplier/);
  });

  it("accepts only a server ticket and never requests supplier metadata", () => {
    const invitation = source("app/(auth)/accept-invitation.tsx");

    expect(invitation).toContain('strategy: "ticket"');
    expect(invitation).toContain("ticket,");
    expect(invitation).toContain("No email yet? Ask Operations");
    expect(invitation).not.toContain("gridgoRole");
    expect(invitation).not.toContain("unsafeMetadata");
    expect(invitation).not.toContain("signupSupplier");
  });

  it("turns every legacy self-signup route into an invitation redirect", () => {
    const layout = source("app/(auth)/signup/_layout.tsx");
    const identity = source("app/(auth)/signup/index.tsx");
    expect(layout).toContain("accept-invitation");
    expect(identity).toContain("accept-invitation");

    for (const route of ["location", "services", "documents", "review"]) {
      expect(source(`app/(auth)/signup/${route}.tsx`)).toContain('from "./index"');
    }
    expect(source("lib/api.ts")).not.toContain('"/auth/signup"');
    expect(source("store/session.ts")).not.toContain("signupSupplier");
  });

  it("uses Clerk's SecureStore cache at the root and fails closed on access", () => {
    const layout = source("app/_layout.tsx");
    const bridge = source("components/ClerkSessionBridge.tsx");
    const access = source("app/access.tsx");

    expect(layout).toContain('from "@clerk/expo/token-cache"');
    expect(layout).toContain("tokenCache={tokenCache}");
    expect(bridge).toContain("clerkAccessFor(user.publicMetadata)");
    expect(bridge).toContain("api.me()");
    expect(access).toContain("Supplier work stays closed here");
    expect(access).toContain("Ask Operations to invite this email");
  });
});
