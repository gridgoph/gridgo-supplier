import { clerkErrorCode } from "@/lib/clerk";
import { missingSignUpFieldsMessage } from "@/lib/clerkSignUp";
import { isEmailish } from "@/lib/onboardingSteps";
import { normalizeInviteIdentity } from "@/lib/shopTeam";

/**
 * Continue with Facebook (issue report 329B287C).
 *
 * The button exists only while GRIDGO's Clerk instance offers Facebook: the
 * answer is read from the environment Clerk loads at launch, so switching the
 * connection on in Clerk lights the button up without an app release, and a
 * Clerk without it leaves the sign-in screen exactly as it was.
 *
 * Facebook, like Google and Apple, only proves who the person is. Clerk links
 * a Facebook login to an existing person by verified email, so a shop that
 * already signs in with Google, Apple, email or mobile lands in the same
 * account; GRIDGO's own door (`enterAfterClerkSession`) then opens the shop or
 * apply exactly as after Google. Clerk asks Facebook for what its Facebook
 * connection is set to ask for (public profile and email); this app never
 * posts anything.
 */

export const FACEBOOK_STRATEGY = "oauth_facebook" as const;

export const FACEBOOK_CANCELLED =
  "Facebook was closed before you finished. Nothing changed. Try again whenever you are ready.";

export const FACEBOOK_UNAVAILABLE =
  "Facebook is not answering just now. Try again in a moment, or sign in with your email.";

export const FACEBOOK_EMAIL_TAKEN =
  "Your Facebook email already has a GRIDGO login. Sign in with that email below, or use the way you signed in before.";

export const FACEBOOK_NO_EMAIL =
  "Facebook did not share an email with GRIDGO. Add your email or mobile and we will send you a 6-digit code.";
export const FACEBOOK_CONTACT_TAKEN =
  "You already have a GRIDGO login with this. Enter the code to sign in to it, so your shop and jobs stay together.";
export const FACEBOOK_RESTART =
  "This Facebook sign-in has expired. Go back and continue with Facebook again.";
export const FACEBOOK_CONTACT_PROBLEM = "Add an email like you@example.com, or a mobile like 0917 123 4567.";
export const FACEBOOK_NO_TEXTS =
  "GRIDGO cannot text codes to mobiles yet. Add your email instead.";

/** The part of Clerk's loaded environment this reads. */
export type ClerkEnvironmentLike = {
  userSettings?: {
    authenticatableSocialStrategies?: readonly string[] | null;
    social?: Record<string, { enabled?: unknown; authenticatable?: unknown } | undefined> | null;
  } | null;
} | null | undefined;

/**
 * Whether Clerk's environment lists Facebook as a way to sign in. Read from
 * the environment Clerk loads at launch (native and web alike), so there is
 * no second request and nothing to keep in step.
 */
export function environmentOffersFacebook(environment: ClerkEnvironmentLike): boolean {
  const settings = environment?.userSettings;
  if (!settings) return false;
  if (Array.isArray(settings.authenticatableSocialStrategies)) {
    return settings.authenticatableSocialStrategies.includes(FACEBOOK_STRATEGY);
  }
  const facebook = settings.social?.[FACEBOOK_STRATEGY];
  return facebook?.enabled === true && facebook.authenticatable !== false;
}

export type FacebookFlowResult = {
  createdSessionId: string | null;
  authSessionResult?: { type?: string } | null;
  signUp?: {
    status?: string | null;
    missingFields?: readonly string[] | null;
    unverifiedFields?: readonly string[] | null;
  } | null;
};

export type FacebookOutcome =
  | { status: "activated"; sessionId: string }
  /** Facebook shared no email: ask for an email or mobile and its code. */
  | { status: "needs_contact" }
  /** Facebook shared an email Clerk still wants proved with a code. */
  | { status: "needs_code" }
  | { status: "incomplete"; message: string }
  | { status: "cancelled" }
  /** The native return is still being adopted by `/sso-callback`. */
  | { status: "pending" };

const CONTACT_FIELDS = ["email_address", "phone_number"];

export function facebookOutcome(result: FacebookFlowResult): FacebookOutcome {
  if (result.createdSessionId) return { status: "activated", sessionId: result.createdSessionId };
  const closed = result.authSessionResult?.type;
  if (closed === "cancel" || closed === "dismiss") return { status: "cancelled" };

  const signUp = result.signUp;
  if (signUp?.status === "missing_requirements") {
    const missing = signUp.missingFields ?? [];
    const unverified = signUp.unverifiedFields ?? [];
    const otherMissing = missing.filter((field) => !CONTACT_FIELDS.includes(field));
    if (otherMissing.length > 0) {
      return { status: "incomplete", message: missingSignUpFieldsMessage(otherMissing) };
    }
    if (missing.some((field) => CONTACT_FIELDS.includes(field))) return { status: "needs_contact" };
    if (unverified.some((field) => CONTACT_FIELDS.includes(field))) return { status: "needs_code" };
    return { status: "incomplete", message: missingSignUpFieldsMessage(missing) };
  }
  if (!result.authSessionResult) return { status: "cancelled" };
  return { status: "pending" };
}

export type FacebookContact =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

/** One field takes either: an email, or a Philippine mobile. */
export function facebookContactFrom(typed: string): FacebookContact | null {
  const trimmed = typed.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    return isEmailish(trimmed) ? { kind: "email", value: trimmed.toLowerCase() } : null;
  }
  const phone = normalizeInviteIdentity("phone", trimmed);
  return phone ? { kind: "phone", value: phone } : null;
}

/** The email or mobile already belongs to a GRIDGO person. */
export function isContactTakenError(error: unknown): boolean {
  const code = clerkErrorCode(error);
  return code === "form_identifier_exists" || code === "identifier_exists";
}

/** Clerk refused the Facebook login because its email belongs to someone. */
export function isFacebookEmailTakenError(error: unknown): boolean {
  const code = clerkErrorCode(error);
  return (
    code === "external_account_exists" ||
    code === "form_identifier_exists" ||
    code === "identifier_already_signed_in" ||
    code === "oauth_email_domain_reserved_by_saml"
  );
}
