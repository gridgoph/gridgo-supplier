/**
 * Read the end of a Sign in with Apple attempt (iPhone only).
 *
 * `useSignInWithApple().startAppleAuthenticationFlow()` from `@clerk/expo/apple`
 * runs Apple's own sheet, exchanges Apple's identity token with Clerk, and
 * turns a sign-up of an existing Apple account into a sign-in. What reaches
 * the screen is one of three things:
 *
 * - a created session, which the sign-in screen activates and then joins to
 *   GRIDGO exactly as it does after Google. Like Google, Apple only proves who
 *   the person is: it never grants supplier access, so a person with no shop
 *   goes on to apply and a non-supplier account is refused at the door;
 * - a sign-up Clerk will not finish without more details, which is said;
 * - nothing at all, which is the person closing Apple's sheet. Clerk swallows
 *   `ERR_REQUEST_CANCELED` and answers with no session; it is never an error.
 */

export type AppleFlowResult = {
  createdSessionId: string | null;
  setActive?: ((args: { session: string }) => Promise<unknown>) | null;
  signUp?: { status?: string | null; missingFields?: readonly string[] | null } | null;
};

export type AppleSignInOutcome =
  | { status: "activated"; sessionId: string }
  | { status: "incomplete"; message: string }
  | { status: "cancelled" };

export const APPLE_SIGN_UP_INCOMPLETE =
  "Apple did not share everything GRIDGO needs to open your account. Try again, or sign in with your email.";

export function appleSignInOutcome(result: AppleFlowResult): AppleSignInOutcome {
  if (result.createdSessionId) return { status: "activated", sessionId: result.createdSessionId };
  if (result.signUp?.status === "missing_requirements") {
    return { status: "incomplete", message: APPLE_SIGN_UP_INCOMPLETE };
  }
  return { status: "cancelled" };
}

/** Apple's own code for a person who closed the sheet. */
export function isAppleCancel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}
