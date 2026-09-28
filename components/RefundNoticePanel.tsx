import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { RefundNotice } from "@/lib/refund";

type Props = {
  notice: RefundNotice;
};

/**
 * A client refund, as it touches this job: work stopped while Operations
 * reviews it, or what the shop keeps once it is settled.
 *
 * Calm on purpose. A refund is not the shop's failure and usually not its
 * decision, so the panel states the fact, what to do (or that nothing is left
 * to do), and the one thing a shop worries about first — its money. No yellow:
 * there is nothing here for the shop to press.
 */
export function RefundNoticePanel({ notice }: Props) {
  return (
    <View
      className={notice.tone === "warning" ? "gg-card gap-3 border-warning" : "gg-card gap-3"}
      testID="refund-notice"
    >
      <View className="flex-row">
        <StatusChip
          tone={notice.tone}
          label={notice.chipLabel}
          icon={notice.icon}
        />
      </View>
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{notice.title}</Text>
        <Text className="text-body text-text-secondary">{notice.body}</Text>
      </View>
    </View>
  );
}
