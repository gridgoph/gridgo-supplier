import { Redirect } from "expo-router";

import { SessionWait } from "@/components/SessionWait";
import { launchHref } from "@/lib/launch";
import { useSession } from "@/store/session";

/**
 * Launch: the door, or the floor.
 *
 * A signed-in shop always opens on Home, including one Operations has not
 * approved yet. Clerk still restoring, and Google still joining, stay on the
 * wait — never Welcome for a half-second before Home.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const identity = useSession((s) => s.identity);
  const sessionWait = useSession((s) => s.sessionWait);
  if (identity.kind === "mismatch" || identity.kind === "error") {
    return <Redirect href={launchHref(identity, user)} />;
  }
  if (sessionWait) return <SessionWait tone={sessionWait} role="supplier" />;
  const href = launchHref(identity, user);
  return <Redirect href={href} />;
}
