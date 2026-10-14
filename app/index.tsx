import { Redirect } from "expo-router";

import { SessionWait } from "@/components/SessionWait";
import { launchHref } from "@/lib/launch";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
import { isSignedIn, useSession } from "@/store/session";

/**
 * Launch: the door, or the floor.
 *
 * A signed-in shop always opens on Home, including one Operations has not
 * approved yet. Clerk still restoring, and Google still joining, stay on the
 * wait — never Welcome for a half-second before Home. So does a signed-in shop
 * whose terms GRIDGO has not answered for yet (at most a few seconds — see
 * `store/legalConsent.ts`): Home, then the agreement screen snatching it away,
 * would read as a crash.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const identity = useSession((s) => s.identity);
  const sessionWait = useSession((s) => s.sessionWait);
  const legal = useLegalConsent((s) => legalGateFor(s, user?.id));
  if (identity.kind === "mismatch" || identity.kind === "error") {
    return <Redirect href={launchHref(identity, user)} />;
  }
  if (sessionWait) return <SessionWait tone={sessionWait} role="supplier" />;
  if (isSignedIn(user) && legal === "unknown") return <SessionWait tone="in" role="supplier" />;
  const href = launchHref(identity, user, legal);
  return <Redirect href={href} />;
}
