import {
  clerkOffersFacebook,
  environmentOffersFacebook,
  facebookContactFrom,
  facebookOutcome,
  isContactTakenError,
  isFacebookEmailTakenError,
  resetFacebookOfferForTests,
} from "@/lib/facebookSignIn";

const KEY = "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k"; // clerk.example.com

function environment(facebook?: { enabled: boolean; authenticatable?: boolean }) {
  return {
    user_settings: {
      social: {
        oauth_google: { enabled: true, authenticatable: true },
        ...(facebook ? { oauth_facebook: facebook } : {}),
      },
    },
  };
}

function answering(body: unknown, ok = true) {
  return jest.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
}

describe("whether Clerk offers Facebook", () => {
  beforeEach(() => resetFacebookOfferForTests());

  it("is on only when the environment lists oauth_facebook as enabled", () => {
    expect(environmentOffersFacebook(environment({ enabled: true, authenticatable: true }))).toBe(true);
    expect(environmentOffersFacebook(environment({ enabled: false }))).toBe(false);
    expect(environmentOffersFacebook(environment({ enabled: true, authenticatable: false }))).toBe(false);
    expect(environmentOffersFacebook(environment())).toBe(false);
    expect(environmentOffersFacebook(null)).toBe(false);
  });

  it("reads Clerk's public environment for this key's instance", async () => {
    const fetchImpl = answering(environment({ enabled: true }));
    await expect(clerkOffersFacebook(KEY, fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://clerk.example.com/v1/environment");
  });

  it("asks once per launch", async () => {
    const fetchImpl = answering(environment({ enabled: true }));
    await clerkOffersFacebook(KEY, fetchImpl);
    await clerkOffersFacebook(KEY, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("hides the button when the read fails, and asks again next time", async () => {
    const failing = jest.fn(async () => {
      throw new Error("offline");
    });
    await expect(clerkOffersFacebook(KEY, failing)).resolves.toBe(false);
    const fetchImpl = answering(environment({ enabled: true }));
    await expect(clerkOffersFacebook(KEY, fetchImpl)).resolves.toBe(true);
  });

  it("hides the button with no usable key", async () => {
    const fetchImpl = answering(environment({ enabled: true }));
    await expect(clerkOffersFacebook(undefined, fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
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
