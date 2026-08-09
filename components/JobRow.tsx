import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import { formatDeadlineTime } from "@/lib/dates";
import { presentOrderState, primaryAction } from "@/lib/jobState";
import { deadlineUrgency } from "@/lib/urgency";

type Props = {
  job: Order;
  now?: Date;
  onPress: () => void;
};

/**
 * One dense agenda line: when, what, and whether it needs the shop.
 *
 * A row is a destination, never an action — accepting or advancing a job always
 * happens on that job's own flow screen.
 */
export function JobRow({ job, now = new Date(), onPress }: Props) {
  const status = presentOrderState(job.state);
  const urgency = deadlineUrgency(job.promisedDate || job.deadline, now);
  const next = primaryAction(job.state);
  const time = formatDeadlineTime(job.promisedDate || job.deadline);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${status.label}${
        urgency.level === "overdue" ? ", late" : ""
      }`}
      className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text
        className={
          urgency.level === "overdue"
            ? "w-16 text-caption font-medium text-error"
            : "w-16 text-caption text-text-muted"
        }
      >
        {time || "—"}
      </Text>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {job.title}
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {job.quantity} × {job.size || "—"}
          {next ? ` · ${next.label}` : ""}
        </Text>
      </View>
      {urgency.level === "overdue" ? (
        <StatusChip tone="error" label="Late" icon="triangle-alert" />
      ) : (
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      )}
    </Pressable>
  );
}
