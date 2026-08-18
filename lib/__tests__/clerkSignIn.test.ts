import { continuationAfterSignIn } from "@/lib/clerkSignIn";

describe("continuationAfterSignIn", () => {
  it("finalizes a complete password attempt", () => {
    expect(continuationAfterSignIn("complete")).toEqual({ kind: "complete" });
  });

  it("asks for the emailed code on MFA and new-device trust", () => {
    expect(continuationAfterSignIn("needs_second_factor")).toEqual({ kind: "email_code" });
    expect(continuationAfterSignIn("needs_client_trust")).toEqual({ kind: "email_code" });
  });

  it("does not treat an unfinished first factor as complete", () => {
    expect(continuationAfterSignIn("needs_first_factor").kind).toBe("blocked");
    expect(continuationAfterSignIn(null).kind).toBe("blocked");
  });
});
