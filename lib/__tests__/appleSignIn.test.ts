import { APPLE_SIGN_UP_INCOMPLETE, appleSignInOutcome, isAppleCancel } from "@/lib/appleSignIn";

describe("appleSignInOutcome", () => {
  it("activates the session Clerk created", () => {
    expect(appleSignInOutcome({ createdSessionId: "sess_apple" })).toEqual({
      status: "activated",
      sessionId: "sess_apple",
    });
  });

  it("reads no session as the sheet being closed, never an error", () => {
    // Clerk swallows Apple's ERR_REQUEST_CANCELED and answers like this.
    expect(appleSignInOutcome({ createdSessionId: null })).toEqual({ status: "cancelled" });
    expect(
      appleSignInOutcome({ createdSessionId: null, signUp: { status: "abandoned" } }),
    ).toEqual({ status: "cancelled" });
  });

  it("says so when Clerk needs more than Apple shared", () => {
    expect(
      appleSignInOutcome({
        createdSessionId: null,
        signUp: { status: "missing_requirements", missingFields: ["phone_number"] },
      }),
    ).toEqual({ status: "incomplete", message: APPLE_SIGN_UP_INCOMPLETE });
  });
});

describe("isAppleCancel", () => {
  it("matches Apple's cancel code only", () => {
    expect(isAppleCancel({ code: "ERR_REQUEST_CANCELED" })).toBe(true);
    expect(isAppleCancel({ code: "ERR_REQUEST_FAILED" })).toBe(false);
    expect(isAppleCancel(new Error("ERR_REQUEST_CANCELED"))).toBe(false);
    expect(isAppleCancel(null)).toBe(false);
  });
});
