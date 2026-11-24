import { useState } from "react";
import { Text, View } from "react-native";

import { AlertsBell } from "@/components/AlertsBell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HowYouEarn } from "@/components/money/HowYouEarn";
import { LaunchBonusCard } from "@/components/money/LaunchBonusCard";
import { MoneyActivity } from "@/components/money/MoneyActivity";
import { ShopBalances } from "@/components/money/ShopBalances";
import { VerifyNoticeCard } from "@/components/verify/VerifyNoticeCard";
import { WaitingPayoutList } from "@/components/verify/WaitingPayoutList";
import { useShopMoney } from "@/hooks/useShopMoney";
import { useShopVerification } from "@/hooks/useShopVerification";
import { launchBonusSummary, type MoneyPeriod } from "@/lib/shopMoney";
import { homePapersOnFile, verifiedMissing } from "@/lib/homePrinter";
import { homeMoneyVerifyBanner, missingPapers, moneyVerifyBanner } from "@/lib/shopVerification";
import { useHomePrinter } from "@/store/homePrinter";
import { PayoutView } from "../payout";

/**
 * Money: the shop's balances with GRIDGO, how it earns and where each part is
 * (gridgo-supplier#269, gridgo-api#416). The Owner's only — the tab is guarded
 * out for Staff, and GRIDGO refuses them the figures anyway.
 *
 * The balances, the period's activity and "How you earn" come from
 * `GET /me/shop-money` and `GET /settings`; a GRIDGO without them draws only
 * the staged statement below, as Money did before. That statement stays: it is
 * where each Regular job's parts and their evidence are.
 */
export default function MoneyScreen() {
  // While the shop is not verified: how much of the cap is used, and which
  // staged payments wait on verification. Kept off the receiving-QR screen.
  const { read } = useShopVerification();
  // A home printer's Verified papers are not a shop's (gridgo-api#412).
  const home = useHomePrinter((s) => s.home);
  const banner = !read
    ? null
    : home
      ? homeMoneyVerifyBanner(read.verification, verifiedMissing(homePapersOnFile(read.files)))
      : moneyVerifyBanner(read.verification, missingPapers(read.files));
  const [period, setPeriod] = useState<MoneyPeriod>("week");
  const money = useShopMoney(period);
  const bonus = money.read ? launchBonusSummary(money.read.jobs) : null;

  return (
    <PayoutView
      header={
        <>
          <ScreenHeader
            title="Money"
            right={
              <View className="flex-row items-center">
                <AlertsBell />
              </View>
            }
          />
          {banner ? (
            <View className="mb-4">
              <VerifyNoticeCard notice={banner} testID="money-verify-banner" />
            </View>
          ) : null}
          {money.read ? (
            <View className="mb-8 gap-6">
              <ShopBalances
                balances={money.read.balances}
                schedule={money.schedule}
                payGridgo={money.read.payGridgo}
              />
              {bonus ? <LaunchBonusCard summary={bonus} /> : null}
              <MoneyActivity read={money.read} period={period} onPeriod={setPeriod} />
              <HowYouEarn schedule={money.schedule} />
            </View>
          ) : null}
          {read?.waiting.length ? (
            <View className="mb-4">
              <WaitingPayoutList waiting={read.waiting} />
            </View>
          ) : null}
          {money.read ? (
            <Text className="mb-3 text-h3 text-text-primary">Jobs paid in parts</Text>
          ) : null}
        </>
      }
    />
  );
}
