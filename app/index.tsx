import { Redirect } from "expo-router";

import { isMatchable, isSignedIn, useSession } from "@/store/session";

/**
 * Launch: the door, the waiting room, or the floor.
 *
 * Three states, matching the three the root guard draws — a shop that has just
 * signed itself up is signed in and **not** matchable, and sending it to the
 * tab shell points at a group `Stack.Protected` has not mounted, which lands on
 * nothing at all. That is exactly the shop least able to work out what
 * happened, so it goes to the screen that explains the wait.
 *
 * Live session changes are still handled by the guard in the root layout; this
 * only decides where a cold start begins.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const identity = useSession((s) => s.identity);
  if (identity.kind === "loading") return null;
  if (
    identity.kind === "unassigned" ||
    identity.kind === "mismatch" ||
    identity.kind === "error"
  ) {
    return <Redirect href="/access" />;
  }
  if (!isSignedIn(user)) return <Redirect href="/(auth)/welcome" />;
  if (!isMatchable(user)) return <Redirect href="/accreditation" />;
  return <Redirect href="/(tabs)/home" />;
}
