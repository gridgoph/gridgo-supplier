import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { formatPhp } from "@/lib/api";
import type { MilestoneView } from "@/lib/milestones";

type Props = {
  milestones: MilestoneView[];
  /**
   * Whether each row explains whose move it is. The job workspace wants it —
   * the shop is deciding what to do next. A payout list of several jobs does
   * not: four sentences per row, repeated, is noise rather than guidance.
   */
  showDetail?: boolean;
};

/**
 * The four parts a job pays out in, and where each one has got to.
 *
 * These are genuinely sequential and each carries its share, so the shares are
 * shown — they are what the shop is owed, not decoration. The list stays
 * monochrome apart from the status chips: money the shop cannot act on must
 * never look like the screen's action.
 */
export function MilestoneList({ milestones, showDetail = false }: Props) {
  if (!milestones.length) return null;

  return (
    <View className="gap-3">
      {milestones.map((milestone, index) => (
        <View key={milestone.code}>
          {index > 0 ? <View className="gg-divider mb-3" /> : null}
          <View className="gap-1.5">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">
                  {milestone.label}
                </Text>
                <Text className="text-caption text-text-muted">
                  {milestone.sharePercent}% of this job
                </Text>
              </View>
              <View className="items-end gap-1.5">
                <Text className="text-body-lg font-medium text-text-primary">
                  {formatPhp(milestone.amountMinor)}
                </Text>
                <StatusChip
                  tone={milestone.tone}
                  label={milestone.statusLabel}
                  icon={milestone.icon}
                />
              </View>
            </View>
            {showDetail ? (
              <Text className="text-caption text-text-secondary">{milestone.detail}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
