import { View } from "react-native";

import { AlertsBell } from "@/components/AlertsBell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { VerifyNoticeCard } from "@/components/verify/VerifyNoticeCard";
import { WaitingPayoutList } from "@/components/verify/WaitingPayoutList";
import { useShopVerification } from "@/hooks/useShopVerification";
import { moneyVerifyBanner } from "@/lib/shopVerification";
import { PayoutView } from "../payout";

/**
 * Money: what the shop has earned and where each part is (gridgo-supplier#269).
 * The Owner's only — the tab is guarded out for Staff, and GRIDGO refuses them
 * the figures anyway. The statement is the same one Earnings has always shown.
 */
export default function MoneyScreen() {
  // While the shop is not verified: how much of the cap is used, and which
  // staged payments wait on verification. Kept off the receiving-QR screen.
  const { read } = useShopVerification();
  const banner = read ? moneyVerifyBanner(read.verification) : null;
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
          {read?.waiting.length ? (
            <View className="mb-4">
              <WaitingPayoutList waiting={read.waiting} />
            </View>
          ) : null}
        </>
      }
    />
  );
}
