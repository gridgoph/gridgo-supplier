import {
  environmentOffersFacebook,
  facebookContactFrom,
  facebookOutcome,
  isContactTakenError,
  isFacebookEmailTakenError,
} from "@/lib/facebookSignIn";

describe("whether Clerk offers Facebook", () => {
  it("reads the sign-in strategies Clerk loaded", () => {
    expect(
      environmentOffersFacebook({
        userSettings: { authenticatableSocialStrategies: ["oauth_google", "oauth_facebook"] },
      }),
    ).toBe(true);
    expect(environmentOffersFacebook({ userSettings: { authenticatableSocialStrategies: ["oauth_google"] } })).toBe(
      false,
    );
  });

  it("falls back to the social settings when the strategy list is absent", () => {
    expect(
      environmentOffersFacebook({ userSettings: { social: { oauth_facebook: { enabled: true, authenticatable: true } } } }),
    ).toBe(true);
    expect(
      environmentOffersFacebook({ userSettings: { social: { oauth_facebook: { enabled: false } } } }),
    ).toBe(false);
    expect(
      environmentOffersFacebook({
        userSettings: { social: { oauth_facebook: { enabled: true, authenticatable: false } } },
      }),
    ).toBe(false);
  });

  it("hides the button before Clerk has an environment", () => {
    expect(environmentOffersFacebook(undefined)).toBe(false);
    expect(environmentOffersFacebook(null)).toBe(false);
    expect(environmentOffersFacebook({ userSettings: null })).toBe(false);
  });
});

describe("what a Facebook attempt ended in", () => {
  it("a session", () => {
    expect(facebookOutcome({ createdSessionId: "sess_1", authSessionResult: { type: "success" } })).toEqual({
      status: "activated",
      sessionId: "sess_1",
    });
  });

  it("the person closing Facebook's window", () => {
    expect(facebookOutcome({ createdSessionId: null, authSessionResult: { type: "cancel" } }).status).toBe("cancelled");
    expect(facebookOutcome({ createdSessionId: null, authSessionResult: { type: "dismiss" } }).status).toBe("cancelled");
  });

  it("no email from Facebook asks for an email or mobile", () => {
    expect(
      facebookOutcome({
        createdSessionId: null,
        authSessionResult: { type: "success" },
        signUp: { status: "missing_requirements", missingFields: ["email_address"] },
      }).status,
    ).toBe("needs_contact");
    expect(
      facebookOutcome({
        createdSessionId: null,
        authSessionResult: { type: "success" },
        signUp: { status: "missing_requirements", missingFields: ["phone_number"] },
      }).status,
    ).toBe("needs_contact");
  });

  it("an email Clerk still wants proved asks for its code", () => {
    expect(
      facebookOutcome({
        createdSessionId: null,
        authSessionResult: { type: "success" },
        signUp: { status: "missing_requirements", missingFields: [], unverifiedFields: ["email_address"] },
      }).status,
    ).toBe("needs_code");
  });

  it("names any other missing detail", () => {
    const outcome = facebookOutcome({
      createdSessionId: null,
      authSessionResult: { type: "success" },
      signUp: { status: "missing_requirements", missingFields: ["username"] },
    });
    expect(outcome).toEqual({ status: "incomplete", message: expect.stringContaining("a username") });
  });

  it("a native return still being adopted", () => {
    expect(facebookOutcome({ createdSessionId: null, authSessionResult: { type: "success" } }).status).toBe("pending");
  });
});

describe("the email-or-mobile field", () => {
  it("takes an email", () => {
    expect(facebookContactFrom(" Shop@Example.com ")).toEqual({ kind: "email", value: "shop@example.com" });
  });

  it("takes a Philippine mobile in any usual spelling", () => {
    expect(facebookContactFrom("0917 123 4567")).toEqual({ kind: "phone", value: "+639171234567" });
    expect(facebookContactFrom("+63 917 123 4567")).toEqual({ kind: "phone", value: "+639171234567" });
  });

  it("refuses anything else", () => {
    expect(facebookContactFrom("")).toBeNull();
    expect(facebookContactFrom("shop@")).toBeNull();
    expect(facebookContactFrom("12345")).toBeNull();
  });
});

describe("Clerk refusals", () => {
  const refusal = (code: string) => ({ errors: [{ code, message: "x" }] });

  it("an email or mobile that already has a login", () => {
    expect(isContactTakenError(refusal("form_identifier_exists"))).toBe(true);
    expect(isContactTakenError(refusal("form_param_format_invalid"))).toBe(false);
  });

  it("a Facebook email that belongs to someone Clerk would not link", () => {
    expect(isFacebookEmailTakenError(refusal("external_account_exists"))).toBe(true);
    expect(isFacebookEmailTakenError(new Error("network"))).toBe(false);
  });
});
