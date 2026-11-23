import { clerkErrorMessage } from "@/lib/clerk";

/**
 * Confirming the shop's mobile with a texted code (guided sign-up, gridgo-api
 * `docs/SUPPLIER_SIGNUP_API.md`).
 *
 * GRIDGO does not trust a typed number: it reads Clerk's own record and
 * refuses the shop step until that number is verified on this sign-in. So the
 * number is added to the Clerk user and confirmed there, the same way
 * `lib/clerkIdentity.ts` confirms a new email. A number already verified on
 * this sign-in needs no code at all.
 */

export type ClerkPhoneNumber = {
  id: string;
  phoneNumber: string;
  verification?: { status?: string | null } | null;
  prepareVerification: () => Promise<unknown>;
  attemptVerification: (params: { code: string }) => Promise<unknown>;
};

export type ClerkPhoneUser = {
  phoneNumbers: ClerkPhoneNumber[];
  createPhoneNumber: (params: { phoneNumber: string }) => Promise<ClerkPhoneNumber>;
  reload?: () => Promise<unknown>;
};

export type PhoneStart =
  | { status: "verified" }
  | { status: "code_sent"; phone: ClerkPhoneNumber }
  | { status: "failed"; message: string };

const SEND_FAILED = "We could not text a code to that number. Check it and try again.";
const CODE_FAILED = "That code did not match. Check the six digits in the text, or send another.";

export function isVerifiedPhone(user: Pick<ClerkPhoneUser, "phoneNumbers"> | null | undefined, mobile: string): boolean {
  return Boolean(
    user?.phoneNumbers.some(
      (phone) => phone.phoneNumber === mobile && phone.verification?.status === "verified",
    ),
  );
}

/** Add the number to this sign-in if it is new, then text it a code. */
export async function startPhoneConfirm(user: ClerkPhoneUser, mobile: string): Promise<PhoneStart> {
  if (isVerifiedPhone(user, mobile)) return { status: "verified" };
  try {
    const phone =
      user.phoneNumbers.find((existing) => existing.phoneNumber === mobile) ??
      (await user.createPhoneNumber({ phoneNumber: mobile }));
    await phone.prepareVerification();
    return { status: "code_sent", phone };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, SEND_FAILED) };
  }
}

export async function resendPhoneCode(phone: ClerkPhoneNumber): Promise<string | null> {
  try {
    await phone.prepareVerification();
    return null;
  } catch (error) {
    return clerkErrorMessage(error, SEND_FAILED);
  }
}

/** `null` when the number is now verified; otherwise the sentence to show. */
export async function confirmPhoneCode(
  user: ClerkPhoneUser,
  phone: ClerkPhoneNumber,
  code: string,
): Promise<string | null> {
  try {
    await phone.attemptVerification({ code: code.replace(/\D/g, "") });
    await user.reload?.();
    return null;
  } catch (error) {
    return clerkErrorMessage(error, CODE_FAILED);
  }
}

/**
 * Clerk's Frontend API host, from the publishable key (public by design):
 * `pk_test_<base64 of "host$">`.
 */
export function frontendApiHost(publishableKey: string | null | undefined): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey?.trim() ?? "");
  if (!match || typeof atob !== "function") return null;
  try {
    const host = atob(match[1]).replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Whether this Clerk instance lets a sign-in hold a mobile number at all.
 *
 * Guided sign-up cannot get past "Your shop" without one — GRIDGO checks the
 * number on Clerk's record — so a GRIDGO that offers the guided flow on a
 * Clerk that has phone numbers switched off would trap a shop on its first
 * step. `false` sends apply back to the older steps; `null` (could not tell)
 * leaves the decision to GRIDGO, which says so on the step itself.
 */
export async function clerkOffersPhoneNumbers(publishableKey: string | null | undefined): Promise<boolean | null> {
  const host = frontendApiHost(publishableKey);
  if (!host) return null;
  try {
    const response = await fetch(`https://${host}/v1/environment`);
    if (!response.ok) return null;
    const body = (await response.json()) as {
      user_settings?: { attributes?: { phone_number?: { enabled?: unknown } } };
    };
    const enabled = body.user_settings?.attributes?.phone_number?.enabled;
    return typeof enabled === "boolean" ? enabled : null;
  } catch {
    return null;
  }
}
