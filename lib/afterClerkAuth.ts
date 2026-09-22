import * as api from "@/lib/api";
import { humanizeApiError, isNonSupplierIdentity, isUnmappedIdentity } from "@/lib/apiErrors";
import { awaitClerkSessionToken, clerkSessionToken, type ClerkAccess, type ClerkGetToken } from "@/lib/clerk";
import { debugAuth } from "@/lib/debugAuth";
import { applyRoute } from "@/lib/onboardingSteps";
import { APP_ROLE, useSession } from "@/store/session";
import { useSignupDraft } from "@/store/signupDraft";

export type AfterClerkAuth =
  | { kind: "home" }
  | { kind: "apply" }
  | { kind: "access" }
  | { kind: "blocked"; message: string };

export type SupplierDoor = "supplier" | "apply" | "wrong_app" | "unknown";

/**
 * A mapped identity that is not a shop. Never name the other GRIDGO app —
 * mailing a code, or saying "no supplier account", would confirm the email.
 */
export const emailUnavailableMessage =
  "This email is not available. Try a different email.";

/** Same sentence Sign in shows when health fails. */
export const gridgoUnreachableMessage =
  "Can’t reach GRIDGO right now. Check this phone’s connection, then try again.";

/**
 * A leftover Clerk session is not the typed email.
 *
 * Refuse only when that leftover is a known non-shop *and* it is the same
 * person who just typed. A client leftover must not block a shop who is
 * signing in on the same phone.
 */
export function leftoverActionForTypedEmail(input: {
  leftoverEmail?: string | null;
  typedEmail: string;
  leftoverDoor: SupplierDoor;
  leftoverAccess: ClerkAccess;
}): "refuse" | "clear" {
  const leftover = (input.leftoverEmail ?? "").trim().toLowerCase();
  const typed = input.typedEmail.trim().toLowerCase();
  const samePerson = leftover.length > 0 && leftover === typed;
  if (
    samePerson &&
    (input.leftoverAccess.kind === "mismatch" || input.leftoverDoor === "wrong_app")
  ) {
    return "refuse";
  }
  return "clear";
}

/**
 * Whether a live Clerk JWT is a shop, some other GRIDGO app, or unmapped.
 *
 * Sign in uses this *before* mailing a second-factor code. A client password
 * is valid at Clerk; mailing that person a job number is how the wrong app
 * looks open.
 */
export async function supplierDoorForClerkSession(
  getToken: ClerkGetToken,
): Promise<SupplierDoor> {
  api.setTokenProvider(() => clerkSessionToken(getToken));
  const token = await awaitClerkSessionToken(getToken);
  if (!token) return "unknown";
  try {
    const user = await api.me({ ignoreUnauthorized: true });
    return user.role === APP_ROLE ? "supplier" : "wrong_app";
  } catch (error) {
    if (isUnmappedIdentity(error)) return "apply";
    if (isNonSupplierIdentity(error)) return "wrong_app";
    return "unknown";
  }
}

/**
 * Join a live Clerk session to GRIDGO's supplier projection.
 *
 * Enrollment writes membership, not Clerk `publicMetadata.gridgoRole`, so the
 * only honest adopt is `/auth/me` with a fresh JWT. A missing membership is
 * apply, never the closed-shop screen. A mapped client/rider/ops identity is
 * not a shop either — Sign in must say so and drop the Clerk session, not
 * walk them onto Access.
 */
export async function enterAfterClerkSession(
  getToken: ClerkGetToken,
): Promise<AfterClerkAuth> {
  api.setTokenProvider(() => clerkSessionToken(getToken));
  const token = await awaitClerkSessionToken(getToken);
  debugAuth("after-clerk-session", { hasToken: Boolean(token) });
  if (!token) {
    return {
      kind: "blocked",
      message: "GRIDGO could not confirm your sign-in. Wait a moment and try again.",
    };
  }

  try {
    const user = await api.me({ ignoreUnauthorized: true });
    debugAuth("after-clerk-me", { status: 200, role: user.role });
    if (user.role !== APP_ROLE) {
      return { kind: "blocked", message: emailUnavailableMessage };
    }
    if (useSession.getState().adoptClerkUser(user)) return { kind: "home" };
    return { kind: "access" };
  } catch (error) {
    if (isUnmappedIdentity(error)) {
      debugAuth("after-clerk-me", { status: 401, next: "apply" });
      const current = useSession.getState().identity;
      const email = "email" in current ? current.email : undefined;
      useSession.getState().setClerkIdentity({ kind: "unassigned", email });
      return { kind: "apply" };
    }
    if (isNonSupplierIdentity(error)) {
      debugAuth("after-clerk-me", { status: 403, next: "blocked" });
      return { kind: "blocked", message: emailUnavailableMessage };
    }
    debugAuth("after-clerk-me", {
      status: error instanceof api.ApiError ? error.status : "network",
      next: "blocked",
    });
    return {
      kind: "blocked",
      message: humanizeApiError(error, gridgoUnreachableMessage),
    };
  }
}

export function prepareApplyDraft(email?: string | null) {
  const trimmed = email?.trim();
  if (trimmed) useSignupDraft.getState().patch({ email: trimmed });
}

export function hrefAfterClerkAuth(
  result: Exclude<AfterClerkAuth, { kind: "blocked" }>,
): "/(tabs)/home" | "/access" | ReturnType<typeof applyRoute> {
  if (result.kind === "home") return "/(tabs)/home";
  if (result.kind === "apply") {
    return applyRoute(useSignupDraft.getState().draft, { clerkSession: true });
  }
  return "/access";
}
