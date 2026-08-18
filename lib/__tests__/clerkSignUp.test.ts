import { continuationAfterSignUp } from "@/lib/clerkSignUp";

describe("continuationAfterSignUp", () => {
  it("treats a leftover Clerk session as ready to enroll", () => {
    expect(
      continuationAfterSignUp({
        status: "missing_requirements",
        existingSession: { sessionId: "sess_1" },
      }),
    ).toEqual({ kind: "existing_session", sessionId: "sess_1" });
  });

  it("finalizes a complete sign-up", () => {
    expect(continuationAfterSignUp({ status: "complete" })).toEqual({ kind: "complete" });
  });

  it("asks for the emailed code when Clerk still needs the address verified", () => {
    expect(
      continuationAfterSignUp({
        status: "missing_requirements",
        unverifiedFields: ["email_address"],
      }),
    ).toEqual({ kind: "email_code" });
  });
});
