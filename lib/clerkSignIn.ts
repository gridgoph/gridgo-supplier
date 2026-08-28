/**
 * What a Clerk password attempt asks for next.
 *
 * Password is first factor. Email code covers both MFA and new-device trust.
 * Finalize only when Clerk says the attempt is complete.
 *
 * A leftover Clerk session is not a login failure. Clerk refuses a second
 * sign-in while one is live ("You're already signed in") even when GRIDGO has
 * no shop on this phone. Sign that leftover out and retry the typed password.
 */

import { isAlreadySignedInError, isClerkSignedOutError } from "@/lib/clerk";

export type SignInContinuation =
  | { kind: "complete" }
  | { kind: "email_code"; reason: "mfa" | "client_trust" }
  | { kind: "blocked"; message: string };

const GENERIC_BLOCKED =
  "GRIDGO could not finish signing in. Check the email and password, then try again.";

export const clerkSignOutRecoveryMessage =
  "GRIDGO could not sign you out of Clerk. Check your connection and try again.";

export function continuationAfterSignIn(status?: string | null): SignInContinuation {
  if (status === "complete") return { kind: "complete" };
  if (status === "needs_second_factor") return { kind: "email_code", reason: "mfa" };
  if (status === "needs_client_trust") return { kind: "email_code", reason: "client_trust" };
  return { kind: "blocked", message: GENERIC_BLOCKED };
}

export type SettleOutcome = "handled" | "ready";

export type SettledAttempt<T> = { kind: "handled" } | { kind: "ran"; value: T };

/**
 * Sign out of Clerk and say whether the session is really gone.
 * "You are signed out" means it already was, which is success.
 */
export async function releaseClerkSession(
  signOut: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await signOut();
    return true;
  } catch (error) {
    return isClerkSignedOutError(error);
  }
}

/**
 * Run a Clerk sign-in attempt with any leftover session settled first.
 *
 * Clerk refuses a second attempt while a session is live, and it can refuse
 * after the fact too — the leftover is cleared, then the attempt is made once
 * more. "You're already signed in" is never the end of the road.
 */
export async function withSettledClerkSession<T>(deps: {
  isSignedIn: boolean;
  settle: (alreadySignedIn: boolean) => Promise<SettleOutcome>;
  run: () => Promise<T>;
}): Promise<SettledAttempt<T>> {
  if ((await deps.settle(deps.isSignedIn)) === "handled") return { kind: "handled" };
  try {
    return { kind: "ran", value: await deps.run() };
  } catch (error) {
    if (!isAlreadySignedInError(error)) throw error;
    if ((await deps.settle(true)) === "handled") return { kind: "handled" };
    return { kind: "ran", value: await deps.run() };
  }
}
