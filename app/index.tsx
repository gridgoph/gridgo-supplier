import { Redirect } from "expo-router";

import { launchHref } from "@/lib/launch";
import { useSession } from "@/store/session";

/**
 * Launch: the door, or the floor.
 *
 * A signed-in shop always opens on Home, including one Operations has not
 * approved yet. Clerk still restoring opens the door — never a blank view.
 * Live session changes are still handled by the guard in the root layout;
 * this only decides where a cold start begins.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const identity = useSession((s) => s.identity);
  const href = launchHref(identity, user);
  return <Redirect href={href} />;
}
