import type { User } from "@/lib/api";
import { isSignedIn, type IdentityState } from "@/store/session";

export type LaunchHref = "/access" | "/(auth)/welcome" | "/(tabs)/home";

/**
 * Where a cold start begins.
 *
 * A signed-in shop — pending or approved — always opens on the floor. The
 * accreditation wait is a screen on that floor, not a second app the guard
 * traps them in. Unassigned Clerk (signed in at Clerk, no GRIDGO membership)
 * is not a signed-in shop here, so it goes to welcome and apply rather than
 * the closed-shop screen.
 */
export function launchHref(
  identity: IdentityState,
  user: User | null,
): LaunchHref | null {
  if (identity.kind === "loading") return null;
  if (identity.kind === "mismatch" || identity.kind === "error") return "/access";
  if (!isSignedIn(user)) return "/(auth)/welcome";
  return "/(tabs)/home";
}
