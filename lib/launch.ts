import type { User } from "@/lib/api";
import { isSignedIn, type IdentityState } from "@/store/session";

export type LaunchHref = "/access" | "/(auth)/welcome" | "/(auth)/login" | "/(tabs)/home";

/**
 * Where a cold start begins.
 *
 * A signed-in shop — pending or approved — always opens on the floor. The
 * accreditation wait is a screen on that floor, not a second app the guard
 * traps them in. Unassigned Clerk (signed in at Clerk, no GRIDGO membership)
 * is not a signed-in shop here, so it goes to welcome and apply rather than
 * the closed-shop screen. Clerk still restoring is the same: send them to
 * the door, never a blank route. A null launch is a black canvas on device.
 */
export function launchHref(
  identity: IdentityState,
  user: User | null,
): LaunchHref {
  if (identity.kind === "mismatch" || identity.kind === "error") return "/access";
  if (identity.kind === "signed_out" && identity.reason === "session_ended") return "/(auth)/login";
  if (!isSignedIn(user)) return "/(auth)/welcome";
  return "/(tabs)/home";
}

/**
 * Whether the signed-out auth screens must stay mounted.
 *
 * Clerk restoration used to flip identity to `loading` and drop this guard.
 * Index then returned null, welcome was unmounted, and the navigator's dark
 * canvas was the whole interface — a black phone with only Expo's refresh
 * control. Keep the door up until a shop is actually signed in or access is
 * blocked. Client sends restoring visitors to welcome for the same reason.
 */
export function authDoorOpen(identity: IdentityState, user: User | null): boolean {
  if (isSignedIn(user)) return false;
  return identity.kind !== "mismatch" && identity.kind !== "error";
}

/**
 * The root stack's key. It changes when a session arrives or leaves, which
 * remounts the stack and every screen on it — so a sheet that outlives its
 * stack key was taken down by the navigator, not by the person holding the
 * phone (see `app/app-update.tsx`).
 */
export function rootStackKey(user: User | null): string {
  return user?.id ?? "signed-out";
}
