import { Handshake } from "lucide-react-native";
import { Text, View } from "react-native";

import { PayoutReceipt } from "@/components/PayoutReceipt";
import { StatusChip } from "@/components/StatusChip";
import { formatPhp } from "@/lib/api";
import type { SettlementPayoutView } from "@/lib/milestones";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  payouts: SettlementPayoutView[];
  /** The job workspace explains each item and shows its transfer evidence; a list of jobs does not. */
  showDetail?: boolean;
};

/**
 * The agreed refund settlement payout, drawn under the stages it replaced.
 *
 * It is a separate payment with its own name, so it is set apart rather than
 * appended as one more stage: a torn-off line, then the item as a slip
 * attached to the job. That line is what tells a shop the stages above were
 * not paid and this is what is paid instead — the item is never mistaken for
 * a stage, and a replaced stage is never mistaken for money that arrived.
 */
export function SettlementPayoutList({ payouts, showDetail = false }: Props) {
  const colors = useThemeColors();
  if (!payouts.length) return null;

  return (
    <View className="gap-3" testID="settlement-payouts">
      <View className="border-t border-dashed border-outline" aria-hidden />
      {showDetail ? (
        <Text className="text-caption text-text-muted">
          Agreed with you when the client&apos;s refund was settled. It replaces the parts above
          that were not paid.
        </Text>
      ) : null}
      {payouts.map((payout) => (
        <View key={payout.id} className="gap-1.5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-start gap-2.5">
              <View
                className="h-8 w-8 items-center justify-center rounded-pill border border-outline"
                aria-hidden
              >
                <Handshake size={16} color={colors.textSecondary} strokeWidth={2} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">{payout.label}</Text>
                <Text className="text-caption text-text-muted">Settlement, paid separately</Text>
              </View>
            </View>
            <View className="items-end gap-1.5">
              <Text
                className={
                  payout.stage === "superseded"
                    ? "text-body-lg font-medium text-text-muted line-through"
                    : "text-body-lg font-medium text-text-primary"
                }
              >
                {formatPhp(payout.amountMinor)}
              </Text>
              <StatusChip tone={payout.tone} label={payout.statusLabel} icon={payout.icon} />
            </View>
          </View>
          {showDetail ? (
            <Text className="text-caption text-text-secondary">{payout.detail}</Text>
          ) : null}
          {showDetail && payout.receiptFileId ? (
            <PayoutReceipt
              fileId={payout.receiptFileId}
              reference={payout.reference}
              label={payout.label}
            />
          ) : showDetail && payout.reference ? (
            <Text className="text-caption text-text-muted">Reference {payout.reference}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
