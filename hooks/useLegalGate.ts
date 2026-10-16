import { useEffect } from "react";
import { AppState } from "react-native";

import { accountHold } from "@/lib/accountHold";
import { useLegalConsent } from "@/store/legalConsent";
import { useSession } from "@/store/session";

/**
 * Asks GRIDGO whether this shop has terms to agree to, on every sign-in and
 * every return to the app (`docs/LEGAL_API.md`: "Apps call pending on each
 * open/sign-in"). An invited shop meets the Supplier Agreement here on its
 * first sign-in.
 *
 * Mounted once at the root stack, because launch and the stack's guards both
 * wait on the answer. A held account is left alone: `SessionShell` already
 * replaces the app with the hold.
 */
export function useLegalGate(): void {
  const userId = useSession((state) => state.user?.id ?? null);
  const held = useSession((state) => accountHold(state.user) != null);

  useEffect(() => {
    if (!userId) {
      useLegalConsent.getState().reset();
      return;
    }
    if (held) return;
    void useLegalConsent.getState().load(userId);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void useLegalConsent.getState().load(userId);
    });
    return () => subscription.remove();
  }, [userId, held]);
}
