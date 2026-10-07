import {
  confirmationStands,
  confirmWithCode,
  confirmWithPassword,
  deletionConfirmMethod,
  DELETION_CHECK_FAILED,
  DELETION_CODE_EXPIRED,
  DELETION_CODE_MISSING,
  DELETION_CODE_SEND_FAILED,
  DELETION_CODE_WRONG,
  DELETION_CONFIRM_WINDOW_MS,
  DELETION_PASSWORD_MISSING,
  DELETION_PASSWORD_WRONG,
  DELETION_TOO_MANY,
  sendDeletionCode,
  type ReverifySession,
} from "@/lib/accountDeletion";

function clerkError(code: string) {
  return { errors: [{ code, message: code }] };
}

function session(overrides: Partial<Record<keyof ReverifySession, jest.Mock>> = {}) {
  return {
    startVerification: jest.fn(async () => ({
      status: "needs_first_factor",
      supportedFirstFactors: [
        { strategy: "password" },
        { strategy: "email_code", emailAddressId: "idn_1", safeIdentifier: "c***@example.com" },
      ],
    })),
    prepareFirstFactorVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
    attemptFirstFactorVerification: jest.fn(async () => ({ status: "complete" })),
    ...overrides,
  };
}

describe("which proof an account gives", () => {
  it("asks for the password whenever the account has one", () => {
    expect(deletionConfirmMethod({ passwordEnabled: true })).toBe("password");
    // Clerk not loaded yet: the password is the safe default to draw.
    expect(deletionConfirmMethod(null)).toBe("password");
  });

  it("emails a code to a Google-only account, which has no password", () => {
    expect(deletionConfirmMethod({ passwordEnabled: false })).toBe("email_code");
  });
});

describe("confirming with the password", () => {
  it("starts a fresh first-factor verification and checks the typed password", async () => {
    const s = session();
    await expect(confirmWithPassword(s, "secret-pass")).resolves.toEqual({ status: "ok" });
    expect(s.startVerification).toHaveBeenCalledWith({ level: "first_factor" });
    expect(s.attemptFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "password",
      password: "secret-pass",
    });
  });

  it("refuses an empty password without asking Clerk", async () => {
    const s = session();
    await expect(confirmWithPassword(s, "")).resolves.toEqual({
      status: "refused",
      message: DELETION_PASSWORD_MISSING,
    });
    expect(s.startVerification).not.toHaveBeenCalled();
  });

  it("points a wrong password at the field", async () => {
    const s = session({
      attemptFirstFactorVerification: jest.fn(async () => {
        throw clerkError("form_password_incorrect");
      }),
    });
    await expect(confirmWithPassword(s, "nope")).resolves.toEqual({
      status: "refused",
      message: DELETION_PASSWORD_WRONG,
    });
  });

  it("says so when Clerk locks the account after too many tries", async () => {
    const s = session({
      attemptFirstFactorVerification: jest.fn(async () => {
        throw clerkError("user_locked");
      }),
    });
    await expect(confirmWithPassword(s, "nope")).resolves.toEqual({
      status: "failed",
      message: DELETION_TOO_MANY,
    });
  });

  it("never treats an unfinished verification as confirmed", async () => {
    const s = session({
      attemptFirstFactorVerification: jest.fn(async () => ({ status: "needs_second_factor" })),
    });
    await expect(confirmWithPassword(s, "pass")).resolves.toEqual({
      status: "failed",
      message: DELETION_CHECK_FAILED,
    });
  });

  it("reads a dropped connection as a failure, not a wrong password", async () => {
    const s = session({
      startVerification: jest.fn(async () => {
        throw new Error("Network request failed");
      }),
    });
    await expect(confirmWithPassword(s, "pass")).resolves.toEqual({
      status: "failed",
      message: DELETION_CHECK_FAILED,
    });
  });
});

describe("confirming a Google-only account with an emailed code", () => {
  it("emails the code to the address Clerk lists for this account", async () => {
    const s = session();
    await expect(sendDeletionCode(s)).resolves.toEqual({
      status: "ok",
      destination: "c***@example.com",
    });
    expect(s.prepareFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "email_code",
      emailAddressId: "idn_1",
    });
  });

  it("fails plainly when Clerk offers no email factor", async () => {
    const s = session({
      startVerification: jest.fn(async () => ({
        status: "needs_first_factor",
        supportedFirstFactors: [{ strategy: "password" }],
      })),
    });
    await expect(sendDeletionCode(s)).resolves.toEqual({
      status: "failed",
      message: DELETION_CODE_SEND_FAILED,
    });
    expect(s.prepareFirstFactorVerification).not.toHaveBeenCalled();
  });

  it("checks six digits against the started verification", async () => {
    const s = session();
    await expect(confirmWithCode(s, " 123 456 ")).resolves.toEqual({ status: "ok" });
    expect(s.attemptFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "email_code",
      code: "123456",
    });
  });

  it("refuses a short code without asking Clerk", async () => {
    const s = session();
    await expect(confirmWithCode(s, "123")).resolves.toEqual({
      status: "refused",
      message: DELETION_CODE_MISSING,
    });
    expect(s.attemptFirstFactorVerification).not.toHaveBeenCalled();
  });

  it("tells a wrong code from an expired one", async () => {
    const wrong = session({
      attemptFirstFactorVerification: jest.fn(async () => {
        throw clerkError("form_code_incorrect");
      }),
    });
    await expect(confirmWithCode(wrong, "123456")).resolves.toEqual({
      status: "refused",
      message: DELETION_CODE_WRONG,
    });

    const expired = session({
      attemptFirstFactorVerification: jest.fn(async () => {
        throw clerkError("verification_expired");
      }),
    });
    await expect(confirmWithCode(expired, "123456")).resolves.toEqual({
      status: "refused",
      message: DELETION_CODE_EXPIRED,
    });
  });
});

describe("a retried send", () => {
  it("rides on a confirmation only inside the window", () => {
    const now = 1_000_000_000;
    expect(confirmationStands(null, now)).toBe(false);
    expect(confirmationStands(now - 1000, now)).toBe(true);
    expect(confirmationStands(now - DELETION_CONFIRM_WINDOW_MS, now)).toBe(false);
  });
});
