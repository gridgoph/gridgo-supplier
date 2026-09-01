import * as ImagePicker from "expo-image-picker";

import { clerkErrorCode, clerkErrorMessage } from "@/lib/clerk";
import { isEmailish } from "@/lib/onboardingSteps";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";

/**
 * The half of a shop's identity Clerk owns: its portrait, its sign-in email,
 * and its sign-in password.
 *
 * GRIDGO owns the shop name, the contact person and the number — those go
 * through `/me/supplier-profile` in `lib/shopProfile.ts`. These three do not, and
 * the boundary is not cosmetic: `PATCH /me/supplier-profile` refuses an email
 * outright (`email_not_editable`), the portrait is never uploaded through
 * GRIDGO's own file store in this slice, and the password never leaves Clerk.
 * So this is the only place that reads Clerk's user surface, and the only place
 * a Clerk refusal becomes a sentence.
 *
 * The email change has three endings, and telling them apart is the whole job:
 *
 * - **Clerk refuses the address.** Somebody already signs in with it. There is
 *   nothing to retry and nothing to take over, so the shop is told plainly and
 *   given the two real ways out.
 * - **Clerk accepts it and GRIDGO keeps its own.** GRIDGO copies Clerk's
 *   primary email onto the account unless another shop's record already holds
 *   that address, in which case it leaves both alone. That is not a failure and
 *   it is not a success — the sign-in moved and the shop's GRIDGO email did
 *   not — so it is said out loud and sent to Operations rather than retried.
 * - **Both take it.** The ordinary ending.
 */

/* --------------------------------------------------------------------------
   The shop's portrait
   -------------------------------------------------------------------------- */

/** The narrow slice of Clerk's user this module needs. Keeps tests honest. */
export type ClerkPortraitUser = {
  setProfileImage: (params: { file: Blob | File | string | null }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export type PortraitOutcome =
  | { status: "ok" }
  /** The shop closed the picker. Nothing happened and nothing is said. */
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export const PORTRAIT_LIBRARY_REFUSED =
  "GRIDGO needs access to your photos to set a shop picture. Turn it on for this app in your phone's settings.";

const PORTRAIT_FAILED =
  "That picture could not be saved to your GRIDGO sign-in. Check this phone's connection and try again.";

/**
 * What React Native can actually hand Clerk.
 *
 * Clerk sends a `file` that is a string as the raw request body under
 * `application/octet-stream`, so a `file://` path or a base64 blob of text
 * would be uploaded verbatim and stored as the picture. The other branch builds
 * a `FormData` and appends the value, which is exactly what React Native's own
 * `FormData` understands as `{ uri, name, type }`. So the descriptor is the
 * shape that works, and the cast below is the price of a type written for a
 * browser's `File`.
 */
export type PortraitFile = { uri: string; name: string; type: string };

export function portraitFile(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): PortraitFile {
  const type = asset.mimeType || "image/jpeg";
  // Clerk stores the name it is given; a shop should not find "IMG_0421" is
  // the only thing naming its own portrait.
  const suffix = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return { uri: asset.uri, name: asset.fileName || `shop-portrait.${suffix}`, type };
}

/**
 * Choose a picture and put it on the GRIDGO sign-in.
 *
 * The library, not the camera. A shop portrait is the sign outside or the last
 * good job on the rack — something already taken — and offering a live camera
 * for it would ask a shop to photograph itself while standing inside itself.
 */
export async function changeShopPortrait(
  user: ClerkPortraitUser,
): Promise<PortraitOutcome> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      // The frame is a circle, so anything else is cropped by the frame rather
      // than by the shop, and a shop that centred its sign would not see it.
      aspect: [1, 1],
      quality: 0.8,
    });
  } catch {
    return { status: "failed", message: PORTRAIT_LIBRARY_REFUSED };
  }

  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { status: "cancelled" };

  try {
    await user.setProfileImage({
      file: portraitFile(asset) as unknown as Blob,
    });
    // Clerk's own copy of the user is what every screen reads `imageUrl` from,
    // so it is re-read here rather than leaving the old picture on screen.
    await user.reload?.();
    return { status: "ok" };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, PORTRAIT_FAILED) };
  }
}

/* --------------------------------------------------------------------------
   The sign-in email
   -------------------------------------------------------------------------- */

/** Clerk's email-address resource, down to what this flow uses. */
export type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
  prepareVerification: (params: { strategy: "email_code" }) => Promise<unknown>;
  attemptVerification: (params: { code: string }) => Promise<unknown>;
};

export type ClerkEmailUser = {
  createEmailAddress: (params: { email: string }) => Promise<ClerkEmailAddress>;
  update: (params: { primaryEmailAddressId: string }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export const EMAIL_ALREADY_REGISTERED =
  "That email already has a GRIDGO sign-in. Use a different address, or sign in with the account that owns it.";

export const EMAIL_UNCHANGED =
  "That is already the email on this shop.";

const EMAIL_SEND_FAILED =
  "GRIDGO could not send a code to that address. Check this phone's connection and try again.";

const EMAIL_CONFIRM_FAILED =
  "That code was not accepted. Check the six digits in the email, or send another code.";

const EMAIL_PRIMARY_FAILED =
  "Your new address is verified, but GRIDGO could not make it the one you sign in with. Try again in a moment.";

/**
 * GRIDGO kept its own address because another shop already has it.
 *
 * Named rather than implied. The sign-in genuinely moved, so telling the shop
 * "nothing happened" would be false, and telling it "your email changed" would
 * be false the next time it read this screen.
 */
export function emailKeptByGridgo(clerkEmail: string, gridgoEmail: string): string {
  return `Your sign-in now uses ${clerkEmail}. GRIDGO already has a shop on that address, so this shop's GRIDGO email is still ${gridgoEmail}. Ask Operations to sort out which shop it belongs to.`;
}

/** What is wrong with the address as typed, before a round trip is spent. */
export function newEmailProblem(value: string, current: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the email address you want to sign in with.";
  if (!isEmailish(trimmed)) return "That does not look like an email address. Check it and try again.";
  if (trimmed.toLowerCase() === current.trim().toLowerCase()) return EMAIL_UNCHANGED;
  return null;
}

export type EmailStepOutcome<T> =
  | { status: "ok"; value: T }
  /** Somebody already signs in with it. Not a retry and not a takeover. */
  | { status: "already_registered" }
  | { status: "failed"; message: string };

/**
 * Add the address to the sign-in and send it a code.
 *
 * Nothing is primary yet. An address Clerk holds but has not verified cannot
 * sign anyone in, so a shop that abandons this halfway is exactly where it
 * started.
 */
export async function startEmailChange(
  user: ClerkEmailUser,
  address: string,
): Promise<EmailStepOutcome<ClerkEmailAddress>> {
  let created: ClerkEmailAddress;
  try {
    created = await user.createEmailAddress({ email: address.trim() });
  } catch (error) {
    if (isAlreadyRegistered(error)) return { status: "already_registered" };
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_SEND_FAILED) };
  }

  try {
    await created.prepareVerification({ strategy: "email_code" });
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_SEND_FAILED) };
  }
  return { status: "ok", value: created };
}

/** Send the code again to an address that is already waiting on one. */
export async function resendEmailCode(
  address: ClerkEmailAddress,
): Promise<EmailStepOutcome<null>> {
  try {
    await address.prepareVerification({ strategy: "email_code" });
    return { status: "ok", value: null };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_SEND_FAILED) };
  }
}

/**
 * Confirm the code, then make the address the one that signs in.
 *
 * Both halves belong together: an address verified but never made primary is a
 * shop that answered its email and still signs in with the old one, with
 * nothing on screen saying so.
 */
export async function confirmEmailChange(
  user: ClerkEmailUser,
  address: ClerkEmailAddress,
  code: string,
): Promise<EmailStepOutcome<string>> {
  try {
    await address.attemptVerification({ code: code.trim() });
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_CONFIRM_FAILED) };
  }

  try {
    await user.update({ primaryEmailAddressId: address.id });
    await user.reload?.();
  } catch (error) {
    if (isAlreadyRegistered(error)) return { status: "already_registered" };
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_PRIMARY_FAILED) };
  }
  return { status: "ok", value: address.emailAddress };
}

/**
 * Clerk saying the address belongs to somebody else.
 *
 * The code is the reliable half; the sentence is checked as well because a
 * refusal that arrives without one still has to reach the shop as the right
 * refusal rather than as a connection problem.
 */
function isAlreadyRegistered(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (code === "form_identifier_exists" || code === "identifier_already_signed_in") return true;
  const message = clerkErrorMessage(error, "").toLowerCase();
  return message.includes("already") && (message.includes("taken") || message.includes("in use"));
}

/* --------------------------------------------------------------------------
   The sign-in password
   -------------------------------------------------------------------------- */

/**
 * Verified against Clerk's user resource rather than assumed: `updatePassword`
 * takes `newPassword`, an optional `currentPassword`, and an optional
 * `signOutOfOtherSessions`. This is the signed-in change, not the signed-out
 * recovery flow — mailing a reset code to a shop that already knows its
 * password would be a longer road to the same place.
 */
export type ClerkPasswordUser = {
  updatePassword: (params: {
    newPassword: string;
    currentPassword?: string;
    signOutOfOtherSessions?: boolean;
  }) => Promise<unknown>;
  /** False for an account that only ever signed in with Google. */
  passwordEnabled?: boolean;
};

export type PasswordField = "current" | "next" | "confirm";

export type PasswordDraft = {
  current: string;
  next: string;
  confirm: string;
};

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = { current: "", next: "", confirm: "" };

export const PASSWORD_WRONG_CURRENT =
  "That is not your current password. Type the one you sign in with now, or sign out and use “Forgot password”.";

export const PASSWORD_NO_PASSWORD_SET =
  "This account signs in with Google, so it has no password to change. Signing in with Google is all it needs.";

const PASSWORD_FAILED =
  "GRIDGO could not change your password. Check this phone's connection and try again.";

export const PASSWORD_CHANGED =
  "Your password is changed. Anywhere else you were signed in has been signed out.";

/**
 * What still stops the change, per field. Nothing here costs a round trip.
 *
 * The new password is held to the same bar the shop met when it opened the
 * account — at least eight characters — and Clerk's own refusals (a pwned
 * password, a complexity rule this instance adds) land afterwards as the
 * sentence Clerk sent, never silently.
 */
export function passwordProblems(draft: PasswordDraft): Partial<Record<PasswordField, string>> {
  const problems: Partial<Record<PasswordField, string>> = {};

  if (!draft.current) {
    problems.current = "Enter the password you sign in with now.";
  }

  if (!draft.next) {
    problems.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (draft.next.length < MIN_PASSWORD_LENGTH) {
    problems.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (draft.next === draft.current) {
    problems.next = "This is the password you already have. Choose a different one.";
  }

  if (draft.confirm !== draft.next) {
    problems.confirm = "These do not match. Type the new password again.";
  }
  return problems;
}

export function passwordReady(draft: PasswordDraft): boolean {
  return Object.keys(passwordProblems(draft)).length === 0;
}

export type PasswordOutcome =
  | { status: "ok" }
  /** Clerk would not take the current password. Points at that field. */
  | { status: "wrong_current" }
  /** Clerk refused the new password (pwned, too weak, too common). */
  | { status: "new_rejected"; message: string }
  | { status: "failed"; message: string };

/**
 * Change the password on the sign-in.
 *
 * `signOutOfOtherSessions` is on and is not offered as a choice. Somebody
 * changing a password on a phone is either tidying up or locking somebody out,
 * and the second reason is the one that matters — a checkbox that lets the
 * other session survive is a checkbox that will be missed by whoever most
 * needed it. The screen says plainly that this is what happens.
 */
export async function changeSignInPassword(
  user: ClerkPasswordUser,
  draft: PasswordDraft,
): Promise<PasswordOutcome> {
  try {
    await user.updatePassword({
      currentPassword: draft.current,
      newPassword: draft.next,
      signOutOfOtherSessions: true,
    });
    return { status: "ok" };
  } catch (error) {
    if (isWrongCurrentPassword(error)) return { status: "wrong_current" };
    if (isNewPasswordRejected(error)) {
      return { status: "new_rejected", message: clerkErrorMessage(error, PASSWORD_FAILED) };
    }
    return { status: "failed", message: clerkErrorMessage(error, PASSWORD_FAILED) };
  }
}

/**
 * Clerk refusing the current password, rather than the new one.
 *
 * Worth telling apart because the two land on different fields: a shop
 * pointed at the new password when the old one was the typo retypes the wrong
 * thing until they give up.
 */
function isWrongCurrentPassword(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (code === "form_password_incorrect" || code === "form_password_validation_failed") {
    return true;
  }
  return /current password|incorrect password|password is incorrect/i.test(
    clerkErrorMessage(error, ""),
  );
}

/**
 * Clerk refusing the new password itself — found in a breach, not strong
 * enough for this instance, or another complexity rule. These belong on the
 * new-password field so the shop sees the missing rule, not a generic failure.
 */
function isNewPasswordRejected(error: unknown): boolean {
  const code = clerkErrorCode(error);
  return (
    code === "form_password_pwned" ||
    code === "form_password_not_strong_enough" ||
    code === "form_password_size_in_bytes_exceeded" ||
    /not strong enough|found in a breach|pwned|data breach|password complexity/i.test(
      clerkErrorMessage(error, ""),
    )
  );
}

/** Restated where the screen needs it, so the rule is written in one place. */
export { MIN_PASSWORD_LENGTH };
