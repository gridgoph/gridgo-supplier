import {
  applyRoute,
  firstIncompleteStep,
  hasProblems,
  isSendable,
  ONBOARDING_STEPS,
  shopStepProblems,
  stepProblems,
  stepProgressLabel,
} from "@/lib/onboardingSteps";
import { EMPTY_SIGNUP_DRAFT, type SignupDraft } from "@/store/signupDraft";

function draft(partial: Partial<SignupDraft> = {}): SignupDraft {
  return {
    ...EMPTY_SIGNUP_DRAFT,
    shopName: "PrintRight Davao",
    contactName: "Ben Santos",
    email: "ben@printright.ph",
    phone: "0917 123 4567",
    password: "at-least-8",
    pin: { lat: 7.0644, lng: 125.6085, label: "C.M. Recto St, Davao City" },
    categoryCodes: ["marketing_collateral"],
    ...partial,
  };
}

describe("the sequence", () => {
  it("asks in the order a shop owner would fill it in", () => {
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      "shop",
      "location",
      "services",
      "review",
    ]);
  });

  it("numbers itself honestly, because this really is a sequence", () => {
    expect(stepProgressLabel("shop")).toBe("Step 1 of 4");
    expect(stepProgressLabel("review")).toBe("Step 4 of 4");
  });
});

describe("what each step still needs", () => {
  it("names every missing field on an empty first step", () => {
    expect(Object.keys(shopStepProblems(EMPTY_SIGNUP_DRAFT)).sort()).toEqual(
      ["contactName", "email", "password", "phone", "shopName"].sort(),
    );
  });

  it("rejects a password the platform would reject anyway, before sending it", () => {
    expect(shopStepProblems(draft({ password: "short" })).password).toContain("8");
    expect(shopStepProblems(draft({ password: "12345678" })).password).toBeUndefined();
  });

  it("catches an email typo without inventing a rule the platform does not have", () => {
    expect(shopStepProblems(draft({ email: "ben" })).email).toBeTruthy();
    expect(shopStepProblems(draft({ email: "ben@shop" })).email).toBeTruthy();
    expect(shopStepProblems(draft({ email: "ben+jobs@shop.com.ph" })).email).toBeUndefined();
  });

  it("accepts a phone number however it is punctuated", () => {
    for (const phone of ["09171234567", "0917 123 4567", "+63 917 123 4567"]) {
      expect(shopStepProblems(draft({ phone })).phone).toBeUndefined();
    }
    expect(shopStepProblems(draft({ phone: "12345" })).phone).toBeTruthy();
  });

  it("requires a pin, and an address on it", () => {
    expect(hasProblems(stepProblems("location", draft({ pin: null })))).toBe(true);
    expect(
      hasProblems(
        stepProblems("location", draft({ pin: { lat: 7.06, lng: 125.6, label: "" } })),
      ),
    ).toBe(true);
    expect(hasProblems(stepProblems("location", draft()))).toBe(false);
  });

  it("requires at least one kind of work, because a rank of nothing is nothing", () => {
    expect(hasProblems(stepProblems("services", draft({ categoryCodes: [] })))).toBe(true);
  });

  it("does not ask for papers on apply — a sendable draft has none", () => {
    expect(ONBOARDING_STEPS.map((step) => step.title)).not.toContain("Your papers");
    expect(isSendable(draft({ documents: {} }))).toBe(true);
  });

  it("points at the first step that still needs something", () => {
    expect(firstIncompleteStep(draft())).toBeNull();
    expect(firstIncompleteStep(draft({ pin: null }))?.id).toBe("location");
    expect(firstIncompleteStep(draft({ shopName: "", pin: null }))?.id).toBe("shop");
    expect(isSendable(draft({ pin: null }))).toBe(false);
  });

  it("does not ask for a password when Clerk already has the session", () => {
    expect(shopStepProblems(draft({ password: "" }), { clerkSession: true }).password).toBeUndefined();
    expect(firstIncompleteStep(draft({ password: "" }), { clerkSession: true })).toBeNull();
    expect(isSendable(draft({ password: "" }), { clerkSession: true })).toBe(true);
    expect(applyRoute(draft({ password: "", pin: null }), { clerkSession: true })).toBe(
      "/(auth)/signup/location",
    );
    expect(applyRoute(draft({ password: "" }), { clerkSession: true })).toBe(
      "/(auth)/signup/review",
    );
  });

  it("never puts an error message in the platform's own words", () => {
    for (const step of ONBOARDING_STEPS) {
      for (const message of Object.values(stepProblems(step.id, EMPTY_SIGNUP_DRAFT))) {
        expect(message).not.toMatch(/_/);
      }
    }
  });
});
