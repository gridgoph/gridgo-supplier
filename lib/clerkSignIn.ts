/**
 * What a Clerk password attempt asks for next.
 *
 * Password is first factor. Email code covers both MFA and new-device trust.
 * Finalize only when Clerk says the attempt is complete.
 */

export type SignInContinuation =
  | { kind: "complete" }
  | { kind: "email_code" }
  | { kind: "blocked"; message: string };

const GENERIC_BLOCKED =
  "GRIDGO could not finish signing in. Check the email and password, then try again.";

export function continuationAfterSignIn(status?: string | null): SignInContinuation {
  if (status === "complete") return { kind: "complete" };
  if (status === "needs_second_factor" || status === "needs_client_trust") {
    return { kind: "email_code" };
  }
  return { kind: "blocked", message: GENERIC_BLOCKED };
}
