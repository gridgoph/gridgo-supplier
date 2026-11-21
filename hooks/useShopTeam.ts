import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import type { ShopRole } from "@/lib/shopTeam";
import type { ShopTeam } from "@/lib/teamRoster";
import { useSession } from "@/store/session";

/**
 * The team, read on every visit and on GRIDGO's identity hint (someone joined,
 * was approved, picked themselves on the shop phone). A screen that has loaded
 * once keeps its roster and says a failed read quietly.
 */
export function useShopTeam() {
  const [team, setTeam] = useState<ShopTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextRead = useReadVersion();

  const reload = useCallback(async () => {
    const current = nextRead();
    try {
      const next = await api.getShopTeam();
      if (!current()) return;
      setTeam(next);
      setError(null);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your team")));
    }
  }, [nextRead]);

  useLiveRefresh(["identity", "approvals"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { team, error, reload };
}

/** Who is looking: their role on the team, and the key their own row carries. */
export function useTeamViewer(): { role: ShopRole; selfKey: string | null } {
  const role = useSession((s) => s.user?.shopRole ?? "owner");
  const selfKey = useSession((s) => s.user?.worker?.pinStaffId ?? s.user?.id ?? null);
  return { role, selfKey };
}
