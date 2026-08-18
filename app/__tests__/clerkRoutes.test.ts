import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public apply and Clerk sign-in routes", () => {
  it("keeps Clerk sign-in, recovery, and Google without a Clerk account creator", () => {
    const login = source("app/(auth)/login.tsx");

    expect(login).toContain("Welcome Back.");
    expect(login).toContain("Let’s sign in");
    expect(login).toContain("Recover Password");
    expect(login).toContain("GoogleSignInButton");
    expect(login).toContain("New shop? Sign up");
    expect(login).toContain('router.push("/(auth)/signup")');
    expect(login).not.toContain("Ask Operations to invite this email");
    expect(login).not.toContain("Client accounts");
    expect(login).not.toMatch(/signUp\./);
  });

  it("does not ask to turn on alerts at the door", () => {
    const login = source("app/(auth)/login.tsx");
    expect(login).not.toContain("PushEnableCard");
  });

  it("offers public apply first and keeps invitation as a secondary path", () => {
    const welcome = source("app/(auth)/welcome.tsx");
    expect(welcome).toContain('label="Sign up"');
    expect(welcome).toContain('router.push("/(auth)/signup")');
    expect(welcome).toContain("Already have an account");
    expect(welcome).toContain("Have an invitation? Open it");
    expect(welcome).toContain("welcome.svg");
    expect(welcome).not.toContain("Client accounts");
    expect(welcome).not.toContain('label="Accept an invitation"');
  });

  it("restores the onboarding stepper instead of redirecting it", () => {
    const layout = source("app/(auth)/signup/_layout.tsx");
    const identity = source("app/(auth)/signup/index.tsx");
    expect(layout).toContain("Stack");
    expect(layout).not.toContain("accept-invitation");
    expect(identity).toContain("OnboardingStep");
    expect(identity).not.toContain("Redirect");

    for (const route of ["location", "services", "review"]) {
      const screen = source(`app/(auth)/signup/${route}.tsx`);
      expect(screen).toContain("OnboardingStep");
      expect(screen).not.toContain("Redirect");
    }
    expect(source("app/(auth)/signup/_layout.tsx")).not.toContain("documents");
    expect(source("lib/api.ts")).toContain("/auth/clerk/enroll/supplier");
    expect(source("lib/api.ts")).not.toContain('"/auth/signup"');
    expect(source("store/session.ts")).toContain("enrollSupplier");
    expect(source("store/session.ts")).not.toContain("signupSupplier");
    expect(source("app/(auth)/signup/review.tsx")).toContain("enrollSupplier");
    expect(source("app/(auth)/signup/review.tsx")).not.toContain("signupSupplier");
    expect(source("app/(auth)/signup/review.tsx")).toContain("signUp.password");
    expect(source("app/(auth)/signup/review.tsx")).toContain("sendEmailCode");
    expect(source("app/(auth)/signup/review.tsx")).not.toContain("prepareFirstFactor");
    expect(source("app/(auth)/signup/review.tsx")).not.toContain("Your papers");
    expect(source("app/(auth)/signup/review.tsx")).toContain("JobTicketCode");
    expect(source("app/(auth)/signup/review.tsx")).toContain('router.replace("/(tabs)/home")');
    expect(source("app/(auth)/signup/review.tsx")).not.toContain('label="Verification code"');
  });

  it("uses the same job-ticket code on login, signup, and recovery", () => {
    expect(source("app/(auth)/login.tsx")).toContain("JobTicketCode");
    expect(source("app/(auth)/login.tsx")).toContain("continuationAfterSignIn");
    expect(source("lib/clerkSignIn.ts")).toContain("needs_second_factor");
    expect(source("lib/clerkSignIn.ts")).toContain("needs_client_trust");
    expect(source("app/(auth)/recover-password.tsx")).toContain("JobTicketCode");
    expect(source("components/JobTicketCode.tsx")).toContain("Send another code");
    expect(source("components/JobTicketCode.tsx")).toContain('textContentType="oneTimeCode"');
    expect(source("components/JobTicketCode.tsx")).not.toContain("Verification code");
  });

  it("uses the Expo Router stack header for login and signup, not a drawn back control", () => {
    const root = source("app/_layout.tsx");
    expect(root).toContain('name="(auth)/login"');
    expect(root).toContain('title: "Sign in"');
    expect(root).not.toMatch(/name="\(auth\)\/login"[^>]*headerShown: false/);

    const signup = source("app/(auth)/signup/_layout.tsx");
    expect(signup).toContain("HeaderBackButton");
    expect(signup).toContain('displayMode="minimal"');
    expect(signup).not.toContain("headerShown: false");

    const step = source("components/OnboardingStep.tsx");
    expect(step).not.toContain("ChevronLeft");
    expect(step).not.toContain("onBack");
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

  it("launches a signed-in shop on Home, including a pending one", () => {
    const index = source("app/index.tsx");
    const layout = source("app/_layout.tsx");
    const launch = source("lib/launch.ts");
    const home = source("app/(tabs)/home.tsx");

    expect(index).toContain("launchHref");
    expect(index).not.toContain("/accreditation");
    expect(launch).toContain('"/(tabs)/home"');
    expect(launch).not.toContain("/accreditation");
    expect(layout).toMatch(/guard=\{signedIn\}[\s\S]*name="\(tabs\)"/);
    expect(home).toContain("Operations is reviewing your shop");
    expect(home).toContain("The floor stays empty until they approve.");
    expect(home).not.toContain("nothing needs you");
  });

  it("uses Clerk's SecureStore cache at the root and fails closed on access", () => {
    const layout = source("app/_layout.tsx");
    const bridge = source("components/ClerkSessionBridge.tsx");
    const access = source("app/access.tsx");

    expect(layout).toContain('from "@clerk/expo/token-cache"');
    expect(layout).toContain("tokenCache={tokenCache}");
    expect(bridge).toContain("clerkAccessFor(user.publicMetadata)");
    expect(bridge).toContain("api.me(");
    expect(access).toContain("Supplier work stays closed here");
  });

  it("does not statically import expo-notifications in the push store", () => {
    const push = source("store/push.ts");
    expect(push).not.toMatch(/^import \* as Notifications from "expo-notifications";/m);
    expect(push).toContain('require("expo-notifications")');
  });
});
