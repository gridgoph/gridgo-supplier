import { View } from "react-native";

import { AlertsBell } from "@/components/AlertsBell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { PayoutView } from "../payout";

/**
 * Money: what the shop has earned and where each part is (gridgo-supplier#269).
 * The Owner's only — the tab is guarded out for Staff, and GRIDGO refuses them
 * the figures anyway. The statement is the same one Earnings has always shown.
 */
export default function MoneyScreen() {
  return (
    <PayoutView
      header={
        <ScreenHeader
          title="Money"
          right={
            <View className="flex-row items-center">
              <AlertsBell />
            </View>
          }
        />
      }
    />
  );
}
