/**
 * Confirming who is asking before an account deletion request is sent.
 *
 * Shared verbatim by the client, supplier and rider apps: the request is the
 * same `POST /me/account-deletion-request` in all three, and so is the step in
 * front of it. Keep the three copies identical.
 *
 * The check is Clerk's **session reverification**, read off the installed
 * types (`@clerk/shared/dist/types/session.d.ts`: `startVerification`,
 * `prepareFirstFactorVerification`, `attemptFirstFactorVerification`) rather
 * than remembered. It re-checks a factor for the session already signed in, so
 * nobody is signed out or sent through the login screen to prove it is them:
 *
 * - **An account with a password types it.** Clerk checks it; GRIDGO never
 *   sees it.
 * - **A Google-only account has no password**, so Clerk emails a six-digit
 *   code to the address the account signs in with, and the code is typed
 *   instead. That is Clerk's own reverification factor for such an account,
 *   not a new way to sign in.
 *
 * A phone left signed in is the case this exists for: somebody who picks it up
 * can open Account, but cannot send the request without the password or the
 * owner's inbox.
 */

/** How this account proves it is the person asking. */
export type DeletionConfirmMethod = "password" | "email_code";

/** The slice of Clerk's user the choice needs. */
export type DeletionConfirmUser = {
  /** False for an account that only ever signed in with Google. */
  passwordEnabled?: boolean;
  primaryEmailAddress?: { emailAddress: string } | null;
};

/**
 * Password whenever the account has one. A Google-only account cannot be
 * asked for something it never set, so it is sent a code instead.
 */
export function deletionConfirmMethod(
  user: DeletionConfirmUser | null | undefined,
): DeletionConfirmMethod {
  return user?.passwordEnabled === false ? "email_code" : "password";
}

/** Clerk's session-verification resource, down to what this flow reads. */
export type ReverificationStep = {
  status: string;
  supportedFirstFactors?: readonly {
    strategy: string;
    emailAddressId?: string;
    safeIdentifier?: string;
  }[] | null;
};

/** The slice of Clerk's signed-in session that re-checks a factor. */
export type ReverifySession = {
  startVerification: (params: { level: "first_factor" }) => Promise<ReverificationStep>;
  prepareFirstFactorVerification: (params: {
    strategy: "email_code";
    emailAddressId: string;
  }) => Promise<ReverificationStep>;
  attemptFirstFactorVerification: (
    params: { strategy: "password"; password: string } | { strategy: "email_code"; code: string },
  ) => Promise<ReverificationStep>;
};

export type ConfirmOutcome =
  | { status: "ok" }
  /** Points at the password or code field: what was typed is wrong. */
  | { status: "refused"; message: string }
  | { status: "failed"; message: string };

export type CodeSentOutcome =
  | { status: "ok"; destination: string }
  | { status: "failed"; message: string };

/** How long one confirmation stands before the request asks again. */
export const DELETION_CONFIRM_WINDOW_MS = 10 * 60 * 1000;

export const DELETION_PASSWORD_MISSING = "Type the password you sign in to GRIDGO with.";
export const DELETION_CODE_MISSING = "Type the 6-digit code from the email.";
export const DELETION_PASSWORD_WRONG =
  "That password is not right. Type the one you sign in to GRIDGO with.";
export const DELETION_CODE_WRONG =
  "That code was not accepted. Check the 6 digits in the email, or send another code.";
export const DELETION_CODE_EXPIRED = "That code has expired. Send another code and use the new one.";
export const DELETION_TOO_MANY =
  "Too many tries. Wait a few minutes, then try again.";
export const DELETION_CHECK_FAILED =
  "GRIDGO could not confirm it is you. Check this phone's connection and try again.";
export const DELETION_CODE_SEND_FAILED =
  "GRIDGO could not email you a code. Check this phone's connection and try again.";
export const DELETION_NO_SESSION =
  "GRIDGO could not reach your sign-in to confirm it is you. Go back, then open Delete account again.";
export const DELETION_REQUEST_FAILED =
  "It is you, but the request did not reach GRIDGO. Check this phone's connection and try again.";
export const DELETION_SENT = "We will delete your account within 30 days";

/** Clerk's own name for what it refused, or null. */
function clerkCode(error: unknown): string | null {
  const errors = (error as { errors?: { code?: string }[] } | null)?.errors;
  return errors?.[0]?.code ?? null;
}

function refusalFor(error: unknown, wrong: string): ConfirmOutcome {
  const code = clerkCode(error);
  if (
    code === "form_password_incorrect" ||
    code === "form_code_incorrect" ||
    code === "verification_failed"
  ) {
    return { status: "refused", message: wrong };
  }
  if (code === "verification_expired") return { status: "refused", message: DELETION_CODE_EXPIRED };
  if (code === "too_many_requests" || code === "user_locked") {
    return { status: "failed", message: DELETION_TOO_MANY };
  }
  return { status: "failed", message: DELETION_CHECK_FAILED };
}

/**
 * Re-check the password on the signed-in session.
 *
 * A verification is started every time, so a password typed now is what is
 * checked — never a session that happened to be confirmed a while ago.
 */
export async function confirmWithPassword(
  session: ReverifySession,
  password: string,
): Promise<ConfirmOutcome> {
  if (!password) return { status: "refused", message: DELETION_PASSWORD_MISSING };
  try {
    await session.startVerification({ level: "first_factor" });
    const step = await session.attemptFirstFactorVerification({ strategy: "password", password });
    return step.status === "complete"
      ? { status: "ok" }
      : { status: "failed", message: DELETION_CHECK_FAILED };
  } catch (error) {
    return refusalFor(error, DELETION_PASSWORD_WRONG);
  }
}

/** Email a code to the address the account signs in with. */
export async function sendDeletionCode(session: ReverifySession): Promise<CodeSentOutcome> {
  try {
    const started = await session.startVerification({ level: "first_factor" });
    const factor = started.supportedFirstFactors?.find(
      (candidate) => candidate.strategy === "email_code" && candidate.emailAddressId,
    );
    if (!factor?.emailAddressId) return { status: "failed", message: DELETION_CODE_SEND_FAILED };
    await session.prepareFirstFactorVerification({
      strategy: "email_code",
      emailAddressId: factor.emailAddressId,
    });
    return { status: "ok", destination: factor.safeIdentifier ?? "" };
  } catch (error) {
    const code = clerkCode(error);
    if (code === "too_many_requests") return { status: "failed", message: DELETION_TOO_MANY };
    return { status: "failed", message: DELETION_CODE_SEND_FAILED };
  }
}

/** Check the emailed code against the verification `sendDeletionCode` started. */
export async function confirmWithCode(
  session: ReverifySession,
  code: string,
): Promise<ConfirmOutcome> {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return { status: "refused", message: DELETION_CODE_MISSING };
  try {
    const step = await session.attemptFirstFactorVerification({
      strategy: "email_code",
      code: digits,
    });
    return step.status === "complete"
      ? { status: "ok" }
      : { status: "failed", message: DELETION_CHECK_FAILED };
  } catch (error) {
    return refusalFor(error, DELETION_CODE_WRONG);
  }
}

/**
 * Whether an earlier confirmation still covers a retry of the request.
 *
 * Only the send can fail after a confirmation succeeds; asking for the code
 * again then would spend a fresh email on a connection problem.
 */
export function confirmationStands(confirmedAt: number | null, now: number): boolean {
  return confirmedAt != null && now - confirmedAt < DELETION_CONFIRM_WINDOW_MS;
}
