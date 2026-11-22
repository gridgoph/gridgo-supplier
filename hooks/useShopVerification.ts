import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import type { ShopVerificationRead } from "@/lib/shopVerification";
import { isShopOwner, useSession, verifyLater } from "@/store/session";

/**
 * The Owner's verification read for To do, Money and Get verified.
 *
 * Only for a shop taking jobs before it is verified, and only for its Owner:
 * GRIDGO refuses the route to Staff, and a verified shop has nothing to say.
 * A failed read keeps what was last read rather than blanking a card — these
 * are side notes, never a reason for a screen to show an error.
 */
export function useShopVerification(): {
  read: ShopVerificationRead | null;
  reload: () => Promise<void>;
} {
  const user = useSession((s) => s.user);
  const enabled = isShopOwner(user) && !user?.worker && verifyLater(user);
  const [read, setRead] = useState<ShopVerificationRead | null>(null);
  const beginRead = useReadVersion();

  const reload = useCallback(async () => {
    if (!enabled) {
      setRead(null);
      return;
    }
    const current = beginRead();
    try {
      const next = await api.getSupplierVerification();
      if (!current()) return;
      setRead(next);
      // This read is also the retry for a bootstrap whose own read failed:
      // the session takes the fresh answer, so access follows GRIDGO.
      const session = useSession.getState().user;
      if (session) {
        const verification = next?.verification ?? null;
        api.rememberVerification(session.id, verification);
        if (
          JSON.stringify(session.verification ?? null) !==
            JSON.stringify(verification) ||
          session.verificationUnreachable
        ) {
          useSession.setState({
            user: { ...session, verification, verificationUnreachable: false },
          });
        }
      }
    } catch {
      // Quiet: keep the last answer, and the session's.
    }
  }, [enabled, beginRead]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useLiveRefresh(["payouts", "approvals", "identity"], reload);

  return { read: enabled ? read : null, reload };
}
