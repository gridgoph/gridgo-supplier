import { continuationAfterSignIn, withSettledClerkSession } from "@/lib/clerkSignIn";

describe("continuationAfterSignIn", () => {
  it("finalizes a complete password attempt", () => {
    expect(continuationAfterSignIn("complete")).toEqual({ kind: "complete" });
  });

  it("asks for the emailed code on MFA, and treats new-device trust separately", () => {
    expect(continuationAfterSignIn("needs_second_factor")).toEqual({
      kind: "email_code",
      reason: "mfa",
    });
    expect(continuationAfterSignIn("needs_client_trust")).toEqual({
      kind: "email_code",
      reason: "client_trust",
    });
  });

  it("does not treat an unfinished first factor as complete", () => {
    expect(continuationAfterSignIn("needs_first_factor").kind).toBe("blocked");
    expect(continuationAfterSignIn(null).kind).toBe("blocked");
  });
});

describe("withSettledClerkSession", () => {
  const alreadySignedIn = { errors: [{ message: "You're already signed in." }] };

  it("settles and retries once when Clerk says the person is already signed in", async () => {
    const settle = jest
      .fn<Promise<"handled" | "ready">, [boolean]>()
      .mockResolvedValueOnce("ready")
      .mockResolvedValueOnce("ready");
    const run = jest
      .fn()
      .mockRejectedValueOnce(alreadySignedIn)
      .mockResolvedValueOnce("signed-in");

    await expect(withSettledClerkSession({ isSignedIn: false, settle, run })).resolves.toEqual({
      kind: "ran",
      value: "signed-in",
    });
    expect(settle).toHaveBeenNthCalledWith(1, false);
    expect(settle).toHaveBeenNthCalledWith(2, true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("passes a real password failure through", async () => {
    const settle = jest.fn(async () => "ready" as const);
    const run = jest.fn().mockRejectedValue(new Error("Incorrect password"));

    await expect(
      withSettledClerkSession({ isSignedIn: false, settle, run }),
    ).rejects.toThrow("Incorrect password");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
