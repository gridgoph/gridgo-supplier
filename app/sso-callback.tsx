import { router } from "expo-router";
import { useEffect } from "react";

import { SessionWait } from "@/components/SessionWait";
import { useSession } from "@/store/session";

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
      router.replace("/(tabs)/home");
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
