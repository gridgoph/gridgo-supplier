import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import type { MoneyPeriod, ShopMoneyRead, ShopMoneySchedule } from "@/lib/shopMoney";
import { isShopOwner, useSession } from "@/store/session";

/**
 * The Owner's balances with GRIDGO and the payout schedule, for Money
 * (`lib/shopMoney.ts`). Only the Owner reads it — Staff, Managers and a PIN
 * worker are never asked, and GRIDGO refuses them anyway.
 *
 * `read` stays null until GRIDGO answers with the route, so a GRIDGO without
 * it leaves Money as it was. A failed refresh keeps the last answer: Money's
 * older statement below says when it is behind.
 */
export function useShopMoney(period: MoneyPeriod): {
  read: ShopMoneyRead | null;
  schedule: ShopMoneySchedule | null;
  reload: () => Promise<void>;
} {
  const user = useSession((s) => s.user);
  const enabled = isShopOwner(user) && !user?.worker;
  const [read, setRead] = useState<ShopMoneyRead | null>(null);
  const [schedule, setSchedule] = useState<ShopMoneySchedule | null>(null);
  const beginRead = useReadVersion();

  const reload = useCallback(async () => {
    if (!enabled) {
      setRead(null);
      return;
    }
    const current = beginRead();
    try {
      const [money, terms] = await Promise.all([
        api.getShopMoney(period),
        api.getShopMoneySchedule(),
      ]);
      if (!current()) return;
      setRead(money);
      setSchedule(terms);
    } catch {
      // Quiet: keep the last answer.
    }
  }, [enabled, period, beginRead]);

  // `reload` changes with the period, so the switch reads again at once.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useLiveRefresh(["payouts", "jobs", "orders", "identity"], reload);

  return { read: enabled ? read : null, schedule: enabled ? schedule : null, reload };
}
