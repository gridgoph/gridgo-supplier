import { router } from "expo-router";
import { useEffect } from "react";

import { SessionWait } from "@/components/SessionWait";
import { isShopStaff, useSession } from "@/store/session";
import { isJoiningTeam } from "@/store/teamJoin";

/**
 * Native Google return. Stay here until GRIDGO has adopted the shop —
 * replacing to `/` is what painted Welcome under a successful sign-in.
 */
export default function SsoCallbackScreen() {
  const user = useSession((state) => state.user);
  const identity = useSession((state) => state.identity);

  useEffect(() => {
    useSession.getState().beginSessionWait("in");
  }, []);

  useEffect(() => {
    if (user) {
      router.replace(isShopStaff(user) ? "/(tabs)/jobs" : "/(tabs)/home");
      return;
    }
    if (identity.kind === "team_pending") {
      router.replace("/team-waiting");
      return;
    }
    // Joining a shop's team: claim next, whatever the login already was.
    if (
      isJoiningTeam() &&
      (identity.kind === "unassigned" || identity.kind === "mismatch" || identity.kind === "error")
    ) {
      useSession.getState().clearSessionWait();
      router.replace("/join-team");
      return;
    }
    if (identity.kind === "mismatch" || identity.kind === "error") {
      router.replace("/access");
      return;
    }
    if (identity.kind === "unassigned") {
      router.replace("/(auth)/signup");
      return;
    }
  }, [identity, user]);

  return <SessionWait tone="in" role="supplier" />;
}
