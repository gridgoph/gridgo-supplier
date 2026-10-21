import type { AppleRevocationRefusal } from "@/lib/apiErrors";

/**
 * Disconnecting Sign in with Apple when an account deletion is requested
 * (App Store Review Guideline 5.1.1(v); gridgo-api
 * `docs/APPLE_REVOCATION_API.md` is the contract).
 *
 * The deletion request is filed first and stands whatever happens here. Only
 * an iPhone whose Clerk user has an Apple account runs this step: Apple asks
 * the person to sign in once more, and the fresh authorization code goes to
 * GRIDGO, which exchanges and revokes it with Apple. The code never reaches
 * Clerk, so the signed-in identity does not change.
 *
 * Two retry rules come from Apple's codes being single use:
 *
 * - **A lost answer resends the same code** before Apple is asked again.
 *   GRIDGO replays a recorded attempt instead of spending the code twice.
 * - **After a disconnect, Apple is never asked again.** A new sign-in could
 *   authorize the app all over again.
 *
 * The same in the client and rider apps except `APPLE_CLIENT_ID`.
 */

/** This app's iOS bundle ID: the only `clientId` GRIDGO accepts from it. */
export const APPLE_CLIENT_ID = "ph.gridgo.supplier";

/** How long to wait on GRIDGO's own attempt still in flight, and how often. */
export const APPLE_BUSY_WAIT_MS = 2000;
export const APPLE_BUSY_RETRIES = 3;

/** The slice of Clerk's user this step reads. */
export type AppleLinkedUser = {
  externalAccounts?: readonly { provider?: string | null }[] | null;
};

export function hasAppleAccount(user: AppleLinkedUser | null | undefined): boolean {
  return user?.externalAccounts?.some((account) => account.provider === "apple") ?? false;
}

/** Only an iPhone can ask Apple again; Android and the web keep today's flow. */
export function appleRevocationApplies(
  user: AppleLinkedUser | null | undefined,
  os: string,
): boolean {
  return os === "ios" && hasAppleAccount(user);
}

/** What the next tap does: resend the code held, ask Apple again, or nothing. */
export type AppleRetry = "same" | "fresh" | null;

export type AppleFailure = { message: string; retry: AppleRetry };

const STILL_STANDS = "Your deletion request still stands.";
const STOP_IT_YOURSELF =
  "You can also stop it yourself in Settings on this iPhone: tap your name, then find Sign in with Apple.";

export const APPLE_NOTICE =
  "This account uses Sign in with Apple. After the request is sent, Apple will ask you to sign in once more so GRIDGO can disconnect it from this app.";
export const APPLE_REVOKED = "Sign in with Apple is disconnected from this app.";
export const APPLE_CANCELLED = `You closed Apple's sign-in, so Sign in with Apple is still connected to this app. ${STILL_STANDS}`;
export const APPLE_SIGN_IN_FAILED = `Apple could not confirm it is you, so Sign in with Apple is still connected to this app. ${STILL_STANDS} Sign in with Apple again to retry.`;
export const APPLE_FILE_FAILED = `GRIDGO could not get ready to disconnect Sign in with Apple. ${STILL_STANDS} Check this phone's connection and try again.`;
/** A 200 that does not say "revoked": never read as a disconnect. */
export const APPLE_NOT_CONFIRMED = `GRIDGO did not confirm that Sign in with Apple is disconnected. ${STILL_STANDS} Sign in with Apple again to retry.`;

const FAILURES: Record<AppleRevocationRefusal, AppleFailure> = {
  lost: {
    message: `GRIDGO's answer did not reach this phone, so it is not known yet whether Sign in with Apple was disconnected. ${STILL_STANDS} Try again; Apple will not ask you to sign in again.`,
    retry: "same",
  },
  busy: {
    message: `GRIDGO is still disconnecting Sign in with Apple from an earlier try. ${STILL_STANDS} Wait a moment, then try again.`,
    retry: "same",
  },
  sign_in_unchecked: {
    message: `GRIDGO could not check your sign-in just now, so Sign in with Apple is still connected. ${STILL_STANDS} Try again.`,
    retry: "same",
  },
  deletion_request_missing: {
    message: `GRIDGO could not find your deletion request, so Sign in with Apple is still connected. Try again to send it with the disconnect.`,
    retry: "same",
  },
  code_expired: {
    message: `Apple's sign-in expired before GRIDGO could use it, so Sign in with Apple is still connected. ${STILL_STANDS} Sign in with Apple again to retry.`,
    retry: "fresh",
  },
  apple_unreachable: {
    message: `GRIDGO could not reach Apple, so Sign in with Apple is still connected. ${STILL_STANDS} Wait a few minutes, then sign in with Apple again to retry.`,
    retry: "fresh",
  },
  apple_unchecked: {
    message: `GRIDGO could not check Apple's answer, so nothing was disconnected. ${STILL_STANDS} Wait a while, then sign in with Apple again to retry.`,
    retry: "fresh",
  },
  apple_unconfirmed: {
    message: `Apple did not confirm the disconnect, so Sign in with Apple may still be connected. ${STILL_STANDS} Sign in with Apple again to retry.`,
    retry: "fresh",
  },
  wrong_apple_id: {
    message: `That Apple ID is not the one this GRIDGO account signs in with, so nothing was disconnected. ${STILL_STANDS} Sign in with Apple again using the Apple ID you use for GRIDGO.`,
    retry: "fresh",
  },
  not_linked: {
    message: `GRIDGO does not see Sign in with Apple on this account, so it has nothing to disconnect. ${STILL_STANDS} ${STOP_IT_YOURSELF}`,
    retry: null,
  },
  not_configured: {
    message: `GRIDGO cannot disconnect Sign in with Apple from this app yet. ${STILL_STANDS} ${STOP_IT_YOURSELF}`,
    retry: null,
  },
  app_setup: {
    message: `This version of the app could not ask GRIDGO to disconnect Sign in with Apple. ${STILL_STANDS} ${STOP_IT_YOURSELF}`,
    retry: null,
  },
  signed_out: {
    message: `Your sign-in ended before Sign in with Apple was disconnected. ${STILL_STANDS} Sign in again, then open Delete account.`,
    retry: null,
  },
};

export function appleRevocationFailure(refusal: AppleRevocationRefusal): AppleFailure {
  return FAILURES[refusal];
}

/** The retry button's words, or null when there is nothing to retry. */
export function appleRetryLabel(retry: AppleRetry): string | null {
  if (retry === "same") return "Try again";
  if (retry === "fresh") return "Sign in with Apple again";
  return null;
}
